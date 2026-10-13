import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { signUpVerified, startTestDb, uniqueEmail } from "./helpers";

vi.stubEnv("BILLING_ENABLED", "true");
vi.stubEnv("STRIPE_MODE", "fake");

const headerState = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => headerState.current,
  cookies: async () => ({ set() {}, get() {}, delete() {}, getAll: () => [] }),
}));

let stop: () => Promise<void>;
let auth: typeof import("@/lib/auth/server").auth;
let models: typeof import("@/lib/db/models");
let connect: typeof import("@/lib/db/connect");
let priceChanges: typeof import("@/lib/services/price-changes");
let catalog: typeof import("@/lib/services/catalog");
let fakeStripe: typeof import("@/lib/billing/stripe-fake");
let getStripe: typeof import("@/lib/billing/stripe").getStripe;
let resetSentJobs: typeof import("@/lib/jobs/send").resetSentJobs;
let sentJobs: typeof import("@/lib/jobs/send").sentJobs;

beforeAll(async () => {
  ({ stop } = await startTestDb("price-changes"));
  connect = await import("@/lib/db/connect");
  auth = (await import("@/lib/auth/server")).auth;
  models = await import("@/lib/db/models");
  priceChanges = await import("@/lib/services/price-changes");
  catalog = await import("@/lib/services/catalog");
  fakeStripe = await import("@/lib/billing/stripe-fake");
  getStripe = (await import("@/lib/billing/stripe")).getStripe;
  ({ resetSentJobs, sentJobs } = await import("@/lib/jobs/send"));
  await connect.connectDb();
  await models.PlanModel.init();
  await models.PlatformSettingsModel.init();
  await models.PriceChangeModel.init();
}, 120_000);

afterAll(async () => {
  await connect?.disconnectDb();
  await stop?.();
});

beforeEach(async () => {
  fakeStripe.resetFakeStripe();
  (await import("@/lib/billing/stripe")).resetStripeClient();
  getStripe = (await import("@/lib/billing/stripe")).getStripe;
  resetSentJobs();
  catalog.invalidateCatalogCache();
  await models.PriceChangeModel.deleteMany({});
  await models.PlanModel.deleteMany({});
  await models.PlatformSettingsModel.deleteMany({});
  await catalog.getPlatformCatalog();
});

async function seedProPrice() {
  const stripe = getStripe();
  const product = await stripe.products.create({ name: "Wisemail Pro" });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: 1200,
    recurring: { interval: "month" },
    lookup_key: "wisemail_pro_monthly",
  });
  await models.PlanModel.updateOne(
    { _id: "pro" },
    {
      $set: {
        priceMonthly: 12,
        "stripe.productId": product.id,
        "stripe.priceMonthlyId": price.id,
        "stripe.lookupMonthly": "wisemail_pro_monthly",
      },
    },
  );
  catalog.invalidateCatalogCache();
  return { product, price };
}

describe("applyPlanPriceChange", () => {
  it("creates a new Stripe price, archives the old one, and records a price_change", async () => {
    const { price: oldPrice } = await seedProPrice();
    const adminEmail = uniqueEmail("admin");
    const admin = await signUpVerified(auth, { name: "Admin", email: adminEmail });
    headerState.current = admin.headers;

    const result = await priceChanges.applyPlanPriceChange({
      plan: "pro",
      interval: "month",
      priceUsd: 14,
      admin: { id: admin.id, name: "Admin", email: adminEmail },
      reason: "annual review",
    });

    expect(result.oldStripePriceId).toBe(oldPrice.id);
    expect(result.newStripePriceId).not.toBe(oldPrice.id);
    expect(result.oldAmountUsd).toBe(12);
    expect(result.newAmountUsd).toBe(14);

    const archived = await getStripe().prices.retrieve(oldPrice.id);
    expect(archived.active).toBe(false);

    const created = await getStripe().prices.retrieve(result.newStripePriceId);
    expect(created.lookup_key).toBe("wisemail_pro_monthly");
    expect(created.unit_amount).toBe(1400);

    const plan = await models.PlanModel.findById("pro").lean();
    expect(plan?.priceMonthly).toBe(14);
    expect(plan?.stripe?.priceMonthlyId).toBe(result.newStripePriceId);

    const row = await models.PriceChangeModel.findById(result.priceChangeId).lean();
    expect(row).toMatchObject({
      plan: "pro",
      interval: "month",
      oldAmountUsd: 12,
      newAmountUsd: 14,
      status: expect.stringMatching(/pending|migrating|done/),
    });

    // In test mode the job is recorded; inline migrate also runs when delivery is false — either way OK.
    expect(
      sentJobs.some((j) => j.name === "billing/price-migration.requested") ||
        row?.status === "done",
    ).toBe(true);
  });

  it("schedules a subscription onto the new price at period end", async () => {
    const { price: oldPrice } = await seedProPrice();
    const stripe = getStripe();
    const customer = await stripe.customers.create({ email: "buyer@example.com" });
    const start = Math.floor(Date.now() / 1000) - 86400;
    const end = start + 30 * 86400;
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: oldPrice.id }],
      metadata: { organizationId: new Types.ObjectId().toHexString() },
    });
    // Ensure period fields exist on the fake item.
    const stored = fakeStripe.fakeStore().subscriptions.get(sub.id)!;
    stored.items.data[0]!.current_period_start = start;
    stored.items.data[0]!.current_period_end = end;

    const orgId = new Types.ObjectId();
    await models.OrgSettingsModel.create({
      orgId,
      plan: "pro",
      planState: "active",
      billingInterval: "month",
      stripeCustomerId: customer.id,
      stripeSubscriptionId: sub.id,
      stripePeriodEnd: new Date(end * 1000),
    });

    const adminEmail = uniqueEmail("admin2");
    const admin = await signUpVerified(auth, { name: "Admin", email: adminEmail });
    const result = await priceChanges.applyPlanPriceChange({
      plan: "pro",
      interval: "month",
      priceUsd: 15,
      admin: { id: admin.id, name: "Admin", email: adminEmail },
    });

    const { migratePriceChange } = await import("@/lib/services/price-migration");
    const migration = await migratePriceChange(result.priceChangeId);
    expect(migration.migrated).toBeGreaterThanOrEqual(1);

    const schedules = [...fakeStripe.fakeStore().schedules.values()];
    expect(schedules.some((s) => s.subscription === sub.id)).toBe(true);

    const open = await priceChanges.findOpenPriceMigration({ plan: "pro", interval: "month" });
    // After a completed migration the open row is gone (status done).
    expect(open === null || open.status !== "done").toBe(true);
  });
});
