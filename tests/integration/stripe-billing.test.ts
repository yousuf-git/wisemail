import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { signUpVerified, startTestDb, uniqueEmail } from "./helpers";

// Billing on, against the in-memory fake Stripe. Set before anything loads `lib/env`.
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
let dal: typeof import("@/lib/dal");
let connect: typeof import("@/lib/db/connect");
let checkout: typeof import("@/lib/billing/checkout");
let fake: typeof import("@/lib/billing/stripe-fake");
let billing: typeof import("@/lib/services/billing");
let webhookRoute: typeof import("@/app/api/billing/stripe-webhook/route");
let usage: typeof import("@/lib/services/billing-usage");
let connections: typeof import("@/lib/services/connections");
let ent: typeof import("@/lib/billing/entitlements");
let perms: typeof import("@/lib/auth/permissions");
let envelope: typeof import("@/lib/crypto/envelope");
let hook: typeof import("@/lib/services/webhook-secret");
let actions: typeof import("@/app/(app)/[orgSlug]/settings/billing/actions");

beforeAll(async () => {
  ({ stop } = await startTestDb("stripe-billing"));
  connect = await import("@/lib/db/connect");
  auth = (await import("@/lib/auth/server")).auth;
  models = await import("@/lib/db/models");
  dal = await import("@/lib/dal");
  checkout = await import("@/lib/billing/checkout");
  fake = await import("@/lib/billing/stripe-fake");
  billing = await import("@/lib/services/billing");
  webhookRoute = await import("@/app/api/billing/stripe-webhook/route");
  usage = await import("@/lib/services/billing-usage");
  connections = await import("@/lib/services/connections");
  ent = await import("@/lib/billing/entitlements");
  perms = await import("@/lib/auth/permissions");
  envelope = await import("@/lib/crypto/envelope");
  hook = await import("@/lib/services/webhook-secret");
  actions = await import("@/app/(app)/[orgSlug]/settings/billing/actions");
  await connect.connectDb();
  await Promise.all(
    Object.values(models).map((m) => (m as { init?: () => Promise<unknown> }).init?.()),
  );
}, 120_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await connect?.disconnectDb();
  await stop?.();
});

type Owner = { id: string; headers: Headers };
let counter = 0;

/** A real user and organization (owner), through Better Auth like production. */
async function newOrg(plan?: "agency") {
  const email = uniqueEmail("owner");
  const owner: Owner = await signUpVerified(auth, { name: "Olive", email });
  const slug = `bill-${++counter}-${Date.now().toString(36)}`;
  const org = await auth.api.createOrganization({
    headers: owner.headers,
    body: { name: `Org ${slug}`, slug },
  });
  const orgId = new Types.ObjectId(org!.id);
  headerState.current = owner.headers;
  const result = await dal.getOrgContext(slug);
  if (result.status !== "ok") throw new Error("no org context");
  void plan;
  return { owner, slug, orgId, ctx: result.ctx };
}

const settings = (orgId: Types.ObjectId) => models.OrgSettingsModel.findOne({ orgId }).lean();

/** Buys `plan` through the plugin's checkout and pays it on the fake hosted page. */
async function subscribe(
  o: Awaited<ReturnType<typeof newOrg>>,
  plan: "pro" | "team" | "agency",
  interval: "month" | "year" = "month",
) {
  const { url } = await checkout.startPlanCheckout(o.ctx, o.owner.headers, { plan, interval });
  const id = url.split("/").pop()!;
  await fake.completeCheckout(id);
  const s = (await settings(o.orgId))!;
  return { sessionId: id, subscriptionId: s.stripeSubscriptionId! };
}

const asAdmin = (o: Awaited<ReturnType<typeof newOrg>>) => ({
  ...o.ctx,
  role: "admin" as const,
  can: (p: import("@/lib/auth/permissions").Permission) => perms.roleHasPermission("admin", p),
});

describe("checkout sessions", () => {
  it.each([
    ["pro", "month", "price_fake_pro_monthly"],
    ["pro", "year", "price_fake_pro_annual"],
    ["team", "month", "price_fake_team_monthly"],
    ["team", "year", "price_fake_team_annual"],
    ["agency", "month", "price_fake_agency_monthly"],
    ["agency", "year", "price_fake_agency_annual"],
  ] as const)("%s billed per %s uses %s", async (plan, interval, price) => {
    const o = await newOrg();
    const { url } = await checkout.startPlanCheckout(o.ctx, o.owner.headers, { plan, interval });
    expect(url).toContain("/dev/stripe/checkout/");
    const created = fake.fakeStore().sessionCreates.at(-1) as Record<string, unknown>;
    expect(created.mode).toBe("subscription");
    expect((created.line_items as { price: string }[])[0]!.price).toBe(price);
    expect(created.client_reference_id).toBe(o.orgId.toHexString());
    expect(
      (created.subscription_data as { billing_mode: { type: string } }).billing_mode.type,
    ).toBe("flexible");
    // Checkout never changes the plan; only Stripe's webhooks do.
    expect((await settings(o.orgId))!.plan).toBe("free");
    const customer = (await settings(o.orgId))!.stripeCustomerId ?? created.customer;
    expect(customer).toBeTruthy();
  });

  it("is refused for anyone but the Owner, in the service, the action and the plugin", async () => {
    const o = await newOrg();
    await expect(
      checkout.startPlanCheckout(asAdmin(o) as never, o.owner.headers, {
        plan: "pro",
        interval: "month",
      }),
    ).rejects.toMatchObject({ name: "ForbiddenError" });

    // The server action wrapper answers forbidden for a member without billing:manage.
    const admin = await signUpVerified(auth, { name: "Adam", email: uniqueEmail("admin") });
    await models.OrgSettingsModel.updateOne({ orgId: o.orgId }, { plan: "free" });
    const { default: mongoose } = await import("mongoose");
    await mongoose.connection.collection("member").insertOne({
      organizationId: o.orgId,
      userId: new Types.ObjectId(admin.id),
      role: "admin",
      createdAt: new Date(),
    } as never);
    headerState.current = admin.headers;
    const denied = await actions.startCheckoutAction(o.slug, { plan: "pro", interval: "month" });
    expect(denied).toMatchObject({ ok: false, error: { code: "forbidden" } });

    // Calling the plugin's endpoint directly does not get around it either.
    await expect(
      auth.api.upgradeSubscription({
        headers: admin.headers,
        body: {
          plan: "pro",
          customerType: "organization",
          referenceId: o.orgId.toHexString(),
          disableRedirect: true,
        },
      }),
    ).rejects.toMatchObject({ status: "UNAUTHORIZED" });
    headerState.current = o.owner.headers;
    const ok = await actions.startCheckoutAction(o.slug, { plan: "pro", interval: "month" });
    expect(ok.ok).toBe(true);
  });
});

describe("subscription sync", () => {
  it("checkout paid -> plan, period, interval and items; cancel and resume; upgrade via portal", async () => {
    const o = await newOrg();
    const { subscriptionId } = await subscribe(o, "pro");
    let s = (await settings(o.orgId))!;
    expect(s).toMatchObject({ plan: "pro", planState: "active", billingInterval: "month" });
    expect(s.stripeCustomerId).toMatch(/^cus_fake_/);
    expect(s.billingPeriod.end.getTime()).toBeGreaterThan(Date.now());
    expect((await ent.getEntitlements(o.orgId)).limits.connections).toBe(3);

    // The overage item of the tier was added to the subscription.
    const sub = await fake.fakeStore().subscriptions.get(subscriptionId)!;
    expect(sub.items.data.map((i) => i.price.id).sort()).toEqual([
      "price_fake_overage_pro",
      "price_fake_pro_monthly",
    ]);

    await fake.simulateSubscription(subscriptionId, "cancel");
    s = (await settings(o.orgId))!;
    expect(s.planState).toBe("canceling");
    expect(s.plan).toBe("pro");
    expect(s.pendingChange?.toPlan).toBe("free");

    await fake.simulateSubscription(subscriptionId, "resume");
    s = (await settings(o.orgId))!;
    expect(s.planState).toBe("active");
    expect(s.pendingChange).toBeNull();

    // Upgrade with a subscription: the plugin sends the customer to Stripe's confirmation page.
    const { url } = await checkout.startPlanCheckout(o.ctx, o.owner.headers, {
      plan: "team",
      interval: "month",
    });
    expect(url).toContain("/dev/stripe/portal/");
    await fake.applyPortalAction(url.split("/").pop()!, "confirm_update");
    s = (await settings(o.orgId))!;
    expect(s.plan).toBe("team");
    expect((await ent.getEntitlements(o.orgId)).limits.connections).toBe(10);
    const after = fake.fakeStore().subscriptions.get(subscriptionId)!;
    // The Pro overage item was swapped for Team's.
    expect(after.items.data.map((i) => i.price.id).sort()).toEqual([
      "price_fake_overage_team",
      "price_fake_team_monthly",
    ]);

    // Subscription ended -> Free.
    await fake.deliverEvent(
      "plugin",
      fake.buildEvent("customer.subscription.deleted", { ...after, status: "canceled" }),
    );
    s = (await settings(o.orgId))!;
    expect(s).toMatchObject({ plan: "free", planState: "free" });
  }, 60_000);

  it("ignores events older than the state already applied", async () => {
    const o = await newOrg();
    const { subscriptionId } = await subscribe(o, "pro");
    const sub = fake.fakeStore().subscriptions.get(subscriptionId)!;
    await billing.syncSubscription({
      ...billing.snapshotFromStripe(o.orgId, sub as never, new Date(Date.now() - 3_600_000)),
      plan: "agency",
    });
    expect((await settings(o.orgId))!.plan).toBe("pro");
  });

  it("annual subscriptions keep monthly allowance windows", async () => {
    const o = await newOrg();
    await subscribe(o, "team", "year");
    const s = (await settings(o.orgId))!;
    expect(s.billingInterval).toBe("year");
    const days = (s.billingPeriod.end.getTime() - s.billingPeriod.start.getTime()) / 86_400_000;
    expect(days).toBeLessThan(32);
  });
});

describe("payment problems", () => {
  it("past_due keeps the plan for 14 days, then moves to Free; paying later restores it", async () => {
    const o = await newOrg();
    const { subscriptionId } = await subscribe(o, "pro");
    await fake.simulateSubscription(subscriptionId, "fail_payment");
    let s = (await settings(o.orgId))!;
    expect(s.planState).toBe("past_due");
    expect(s.plan).toBe("pro");
    expect(s.grace?.pastDueSince).toBeInstanceOf(Date);
    expect((await ent.getEntitlements(o.orgId)).plan).toBe("pro");
    const note = await models.NotificationModel.findOne({
      orgId: o.orgId,
      type: "payment_failed",
    }).lean();
    expect(note).toBeTruthy();

    const since = s.grace!.pastDueSince!.getTime();
    expect((await billing.expirePaymentGrace(new Date(since + 13 * 86_400_000))).moved).toBe(0);
    expect((await settings(o.orgId))!.plan).toBe("pro");
    expect((await billing.expirePaymentGrace(new Date(since + 15 * 86_400_000))).moved).toBe(1);
    s = (await settings(o.orgId))!;
    expect(s).toMatchObject({ plan: "free", planState: "free" });

    // The invoice is paid after all: Stripe's subscription update brings the plan back.
    await fake.simulateSubscription(subscriptionId, "pay");
    s = (await settings(o.orgId))!;
    expect(s).toMatchObject({ plan: "pro", planState: "active" });
    expect(s.grace?.pastDueSince ?? null).toBeNull();
  }, 60_000);

  it("paying within the grace period clears the payment issue", async () => {
    const o = await newOrg();
    const { subscriptionId } = await subscribe(o, "team");
    await fake.simulateSubscription(subscriptionId, "fail_payment");
    expect((await settings(o.orgId))!.planState).toBe("past_due");
    await fake.simulateSubscription(subscriptionId, "pay");
    const s = (await settings(o.orgId))!;
    expect(s.planState).toBe("active");
    expect(s.grace?.pastDueSince ?? null).toBeNull();
  }, 60_000);
});

describe("billing webhook", () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    webhookRoute.POST(
      new Request("http://localhost:3000/api/billing/stripe-webhook", {
        method: "POST",
        body,
        headers,
      }),
    );

  it("answers 400 to a missing, wrong or tampered signature and changes nothing", async () => {
    const event = fake.buildEvent("invoice.paid", { id: "in_x", customer: "cus_none" });
    const good = fake.signedWebhookRequest("billing", event, "http://localhost:3000");
    const body = await good.clone().text();
    const header = good.headers.get("stripe-signature")!;

    expect((await post(body)).status).toBe(400);
    expect((await post(body, { "stripe-signature": "t=1,v1=deadbeef" })).status).toBe(400);
    expect((await post(body + " ", { "stripe-signature": header })).status).toBe(400);
    // A signature made with the plugin's secret is not valid on this endpoint.
    const wrong = fake.signedWebhookRequest("plugin", event, "http://localhost:3000");
    expect(
      (await post(body, { "stripe-signature": wrong.headers.get("stripe-signature")! })).status,
    ).toBe(400);
    expect((await post(body, { "stripe-signature": header })).status).toBe(200);
  });

  it("processes an event once; a replay is a no-op", async () => {
    const o = await newOrg();
    const { subscriptionId } = await subscribe(o, "pro");
    const customer = (await settings(o.orgId))!.stripeCustomerId!;
    const event = fake.buildEvent("invoice.payment_failed", {
      id: "in_replay",
      customer,
      parent: { subscription_details: { subscription: subscriptionId } },
    });
    const send = () => webhookRoute.POST(fake.signedWebhookRequest("billing", event, "http://x"));
    const first = await (await send()).json();
    expect(first).toMatchObject({ received: true, status: "processed" });
    // Someone fixes the state; a replayed event must not break it again.
    await models.OrgSettingsModel.updateOne(
      { orgId: o.orgId },
      { planState: "active", "grace.pastDueSince": null },
    );
    const second = await (await send()).json();
    expect(second.status).toBe("duplicate");
    expect((await settings(o.orgId))!.planState).toBe("active");
    expect(await models.StripeEventModel.countDocuments({ eventId: event.id })).toBe(1);
  });
});

describe("credit packs", () => {
  it("are refused on Free", async () => {
    const o = await newOrg();
    await expect(checkout.startCreditPackCheckout(o.ctx)).rejects.toMatchObject({
      code: "plan_feature_locked",
    });
  });

  it("grant credits once per Checkout session, however many events arrive", async () => {
    const o = await newOrg();
    await subscribe(o, "pro");
    const before = (await settings(o.orgId))!.aiCredits?.packBalance ?? 0;
    const { url } = await checkout.startCreditPackCheckout(o.ctx, { quantity: 2 });
    const sessionId = url.split("/").pop()!;
    const created = fake.fakeStore().sessionCreates.at(-1) as Record<string, unknown>;
    expect(created.mode).toBe("payment");
    expect((created.line_items as { price: string; quantity: number }[])[0]).toEqual({
      price: "price_fake_credit_pack",
      quantity: 2,
    });

    await fake.completeCheckout(sessionId);
    expect((await settings(o.orgId))!.aiCredits?.packBalance).toBe(before + 2_000);

    // The same session arriving again under another event id (async payment) pays out nothing.
    const session = fake.fakeStore().sessions.get(sessionId)!;
    await fake.deliverEvent(
      "billing",
      fake.buildEvent("checkout.session.async_payment_succeeded", session),
    );
    await fake.deliverEvent("billing", fake.buildEvent("checkout.session.completed", session));
    expect((await settings(o.orgId))!.aiCredits?.packBalance).toBe(before + 2_000);
    const audit = await models.AuditLogModel.countDocuments({
      orgId: o.orgId,
      action: "billing.credit_pack_purchased",
    });
    expect(audit).toBe(1);
  }, 60_000);

  it("ignores a session whose customer belongs to another organization", async () => {
    const a = await newOrg();
    const b = await newOrg();
    await subscribe(a, "pro");
    await subscribe(b, "pro");
    const customerB = (await settings(b.orgId))!.stripeCustomerId!;
    const before = (await settings(a.orgId))!.aiCredits?.packBalance ?? 0;
    const forged = fake.buildEvent("checkout.session.completed", {
      id: "cs_forged",
      mode: "payment",
      payment_status: "paid",
      customer: customerB,
      metadata: { kind: "credit_pack", orgId: a.orgId.toHexString(), credits: "1000" },
    });
    const res = await webhookRoute.POST(fake.signedWebhookRequest("billing", forged, "http://x"));
    expect(await res.json()).toMatchObject({ status: "ignored", reason: "org_mismatch" });
    expect((await settings(a.orgId))!.aiCredits?.packBalance ?? 0).toBe(before);
  }, 60_000);
});

describe("Agency extra connections", () => {
  async function seedConnections(orgId: Types.ObjectId, count: number) {
    for (let i = 0; i < count; i++) {
      const _id = new Types.ObjectId();
      const key = `re_seed${_id.toHexString().slice(-8)}_full`;
      await models.ConnectionModel.create({
        _id,
        orgId,
        name: `seed-${_id}`,
        resendTeamFingerprint: `fp-${_id}`,
        createdBy: new Types.ObjectId(),
        status: "active",
        apiKey: envelope.encryptSecret(key, { aad: hook.keyAad(_id) }),
        apiKeyLast4: key.slice(-4),
        webhook: {
          resendId: `wh_${_id}`,
          signingSecret: envelope.encryptSecret("s", { aad: hook.secretAad(_id) }),
          events: [],
          registeredAt: new Date(),
        },
      });
    }
  }

  it("asks before the 16th, charges by quantity with proration, and lowers it on removal", async () => {
    const o = await newOrg();
    const { subscriptionId } = await subscribe(o, "agency");
    await seedConnections(o.orgId, 15);
    const updates = () =>
      fake.fakeStore().subscriptionUpdates.filter((u) => u.id === subscriptionId);
    const quantity = () =>
      fake
        .fakeStore()
        .subscriptions.get(subscriptionId)!
        .items.data.find((i) => i.price.id === "price_fake_extra_connection_monthly")?.quantity;
    expect(quantity()).toBeUndefined();

    const input = { name: "Sixteen", apiKey: "re_sixteen_full" };
    // Admins cannot approve a charge.
    await expect(connections.addConnection(asAdmin(o) as never, input)).rejects.toMatchObject({
      code: "plan_limit_reached",
    });
    // The Owner has to confirm the cost first; nothing is charged for the question.
    const asked = updates().length;
    await expect(connections.addConnection(o.ctx, input)).rejects.toMatchObject({
      code: "confirmation_required",
      message: expect.stringContaining("$5/month"),
    });
    expect(updates().length).toBe(asked);
    expect(await models.ConnectionModel.countDocuments({ orgId: o.orgId })).toBe(15);

    const added = await connections.addConnection(o.ctx, { ...input, confirmExtraCost: true });
    expect(added.name).toBe("Sixteen");
    expect(quantity()).toBe(1);
    const raise = updates().at(-1)!.params as { proration_behavior: string };
    expect(raise.proration_behavior).toBe("create_prorations");
    expect((await settings(o.orgId))!.extraConnections).toBe(1);
    expect((await ent.getEntitlements(o.orgId)).limits.connections).toBe(16);

    // Removing one lowers the quantity from the next invoice (no proration credit).
    await connections.removeConnection(o.ctx, {
      connectionId: added.id,
      confirmName: "Sixteen",
      deleteSyncedData: false,
    });
    expect(quantity()).toBe(0);
    expect((updates().at(-1)!.params as { proration_behavior: string }).proration_behavior).toBe(
      "none",
    );
    expect((await settings(o.orgId))!.extraConnections).toBe(0);
  }, 120_000);

  it("does not charge when the connection cannot be created", async () => {
    const o = await newOrg();
    const { subscriptionId } = await subscribe(o, "agency");
    await seedConnections(o.orgId, 15);
    await expect(
      connections.addConnection(o.ctx, {
        name: "Nope",
        apiKey: "re_nope_invalid",
        confirmExtraCost: true,
      }),
    ).rejects.toBeTruthy();
    const item = fake
      .fakeStore()
      .subscriptions.get(subscriptionId)!
      .items.data.find((i) => i.price.id === "price_fake_extra_connection_monthly");
    expect(item?.quantity ?? 0).toBe(0);
    expect((await settings(o.orgId))!.extraConnections ?? 0).toBe(0);
  }, 120_000);
});

describe("overage meter reports", () => {
  it("reports one meter event per 10k unit, once", async () => {
    const o = await newOrg();
    await subscribe(o, "team");
    const s = (await settings(o.orgId))!;
    const period = await models.UsagePeriodModel.create({
      orgId: o.orgId,
      periodStart: s.billingPeriod.start,
      periodEnd: s.billingPeriod.end,
      plan: "team",
      allowance: 500_000,
      overage: { emails: 25_000 },
    });
    const events = () =>
      [...fake.fakeStore().meterEvents.entries()].filter(([id]) =>
        id.includes(o.orgId.toHexString()),
      );

    const first = await usage.reportOverageUsage();
    expect(first.errors).toBe(0);
    expect(events()).toHaveLength(3); // 25,000 over -> 3 units, rounded up
    expect(events().every(([, e]) => e.event_name === "wisemail_overage_team")).toBe(true);
    expect(events().every(([, e]) => e.customer === s.stripeCustomerId && e.value === 1)).toBe(
      true,
    );
    expect(
      (await models.UsagePeriodModel.findById(period._id).lean())!.overage?.reportedToStripe,
    ).toBe(3);

    // Running again (a retry, the next day) sends nothing new.
    await usage.reportOverageUsage();
    expect(events()).toHaveLength(3);

    // Even if the progress marker were lost, the identifiers make Stripe absorb the repeats.
    await models.UsagePeriodModel.updateOne({ _id: period._id }, { "overage.reportedToStripe": 0 });
    await usage.reportOverageUsage();
    expect(events()).toHaveLength(3);

    // More usage reports only the new units.
    await models.UsagePeriodModel.updateOne({ _id: period._id }, { "overage.emails": 31_000 });
    await usage.reportOverageUsage();
    expect(events()).toHaveLength(4);
    expect(events().map(([id]) => id)).toContain(
      usage.overageIdentifier(o.orgId.toHexString(), s.billingPeriod.start, 4),
    );
  }, 60_000);

  it("skips Free orgs and orgs without a subscription", async () => {
    const o = await newOrg();
    const s = (await settings(o.orgId))!;
    await models.UsagePeriodModel.create({
      orgId: o.orgId,
      periodStart: s.billingPeriod.start,
      periodEnd: s.billingPeriod.end,
      plan: "free",
      allowance: 5_000,
      overage: { emails: 50_000 },
    });
    const before = fake.fakeStore().meterEvents.size;
    await usage.reportOverageUsage();
    expect(fake.fakeStore().meterEvents.size).toBe(before);
  });
});
