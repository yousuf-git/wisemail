/**
 * Sends signed Stripe webhook events for an organization's subscription to a running dev server,
 * to try the billing flows in `STRIPE_MODE=fake` without a Stripe account:
 *
 *   pnpm stripe:simulate <orgSlug> past_due|paid|cancel|resume|deleted [--url http://localhost:4100]
 *
 *   past_due  subscription past due + `invoice.payment_failed` (banner, 14 days of grace)
 *   paid      subscription active again + `invoice.paid`
 *   cancel    cancel at period end (plan shows as canceling)
 *   resume    undo the cancellation
 *   deleted   the subscription ended (the org moves to Free)
 *
 * The events are built from the org's subscription row in the dev database and signed with the
 * fake webhook secrets, so they take the same route as Stripe's own (`/api/auth/stripe/webhook`
 * and `/api/billing/stripe-webhook`). Needs the app's env (.env.local) and `pnpm db:dev`.
 */
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const ACTIONS = ["past_due", "paid", "cancel", "resume", "deleted"] as const;
type Action = (typeof ACTIONS)[number];

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { url: { type: "string" } },
  });
  const [slug, action] = positionals as [string | undefined, Action | undefined];
  if (!slug || !action || !ACTIONS.includes(action)) {
    console.error(`Usage: pnpm stripe:simulate <orgSlug> ${ACTIONS.join("|")} [--url <baseUrl>]`);
    process.exit(2);
  }

  const { env } = await import("@/lib/env");
  if (!env.BILLING_ENABLED || env.STRIPE_MODE !== "fake") {
    console.error("This script needs BILLING_ENABLED=true and STRIPE_MODE=fake.");
    process.exit(1);
  }
  const { default: mongoose } = await import("mongoose");
  const { connectDb, disconnectDb } = await import("@/lib/db/connect");
  const { buildEvent, signedWebhookRequest } = await import("@/lib/billing/stripe-fake");
  const { planPriceKey, priceId } = await import("@/lib/billing/stripe-prices");

  await connectDb();
  const org = await mongoose.connection.collection("organization").findOne({ slug });
  const row = org
    ? await mongoose.connection
        .collection("subscription")
        .findOne({ referenceId: org._id.toHexString() }, { sort: { periodEnd: -1 } })
    : null;
  await disconnectDb();
  if (!org || !row?.stripeSubscriptionId) {
    console.error(
      `No subscription found for "${slug}". Subscribe through the fake checkout first.`,
    );
    process.exit(1);
  }

  const seconds = (d: Date | null | undefined) =>
    d ? Math.floor(new Date(d).getTime() / 1000) : null;
  const interval = row.billingInterval === "year" ? "year" : "month";
  const sub = {
    id: row.stripeSubscriptionId as string,
    object: "subscription",
    customer: row.stripeCustomerId as string,
    status: action === "past_due" ? "past_due" : action === "deleted" ? "canceled" : "active",
    cancel_at_period_end: action === "cancel",
    cancel_at: action === "cancel" ? seconds(row.periodEnd) : null,
    canceled_at: action === "cancel" || action === "deleted" ? seconds(new Date()) : null,
    ended_at: action === "deleted" ? seconds(new Date()) : null,
    trial_start: null,
    trial_end: null,
    metadata: {},
    schedule: null,
    items: {
      object: "list",
      data: [
        {
          id: "si_simulated",
          quantity: 1,
          price: {
            id: priceId(planPriceKey(row.plan as "pro" | "team" | "agency", interval)),
            lookup_key: null,
            recurring: { interval },
          },
          current_period_start: seconds(row.periodStart),
          current_period_end: seconds(row.periodEnd),
        },
      ],
    },
  };
  const invoice = {
    id: `in_sim_${Date.now().toString(36)}`,
    object: "invoice",
    customer: sub.customer,
    parent: { type: "subscription_details", subscription_details: { subscription: sub.id } },
  };

  const base = values.url ?? env.APP_URL;
  const send = async (target: "plugin" | "billing", type: string, object: unknown) => {
    const res = await fetch(signedWebhookRequest(target, buildEvent(type, object), base));
    console.log(`${type} -> ${target}: ${res.status}`);
    if (!res.ok) process.exitCode = 1;
  };

  await send(
    "plugin",
    action === "deleted" ? "customer.subscription.deleted" : "customer.subscription.updated",
    sub,
  );
  if (action === "past_due") await send("billing", "invoice.payment_failed", invoice);
  if (action === "paid") await send("billing", "invoice.paid", invoice);
}

void main();
