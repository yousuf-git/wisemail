import "server-only";

import { Types } from "mongoose";
import mongoose from "mongoose";
import type Stripe from "stripe";

import { PAYMENT_GRACE_DAYS, RETENTION_NOTICE_DAYS } from "@/lib/billing/plans";
import { describePrice, type BillingInterval, type PaidPlan } from "@/lib/billing/stripe-prices";
import { connectDb } from "@/lib/db/connect";
import { OrgSettingsModel, calendarMonth, type Plan } from "@/lib/db/models/org-settings";
import { withTransaction } from "@/lib/db/transaction";
import { writeAuditLog } from "./audit";
import { createNotifications } from "./notifications";
import { applyPlanChange } from "./plan-changes";

/**
 * Subscription state, payment problems and the payment grace period (PRICING §6). Stripe is the
 * source of truth for what an org pays for; this module derives `org_settings` from it and is
 * called by the Better Auth Stripe plugin hooks (`lib/billing/stripe-plugin.ts`) and by the
 * billing webhook (`lib/services/billing-webhook.ts`). Every function is idempotent: replaying
 * the same Stripe state changes nothing, and events older than the state already applied are
 * ignored.
 */

const DAY = 86_400_000;

/** The parts of a Stripe subscription the app cares about. */
export type SubscriptionSnapshot = {
  orgId: Types.ObjectId;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  /** Plan of the subscription's plan item, `null` when no item matches a Wisemail plan price. */
  plan: PaidPlan | null;
  status: Stripe.Subscription.Status;
  interval: BillingInterval | null;
  periodStart: Date;
  periodEnd: Date;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  eventAt: Date;
};

const asId = (ref: string | { id: string } | null | undefined) =>
  typeof ref === "string" ? ref : (ref?.id ?? "");

/** The plan item of a Stripe subscription (the one priced with a Wisemail plan price). */
export function findPlanItem(sub: Pick<Stripe.Subscription, "items">) {
  for (const item of sub.items.data) {
    const info = describePrice(item.price.id);
    if (info?.kind === "plan") return { item, plan: info.plan, interval: info.interval };
  }
  return null;
}

/** Reads a Stripe subscription (webhook object) into the snapshot `syncSubscription` applies. */
export function snapshotFromStripe(
  orgId: Types.ObjectId,
  sub: Stripe.Subscription,
  eventAt: Date,
): SubscriptionSnapshot {
  const found = findPlanItem(sub);
  const anyItem = sub.items.data[0];
  const item = found?.item ?? anyItem;
  const seconds = (n: number | null | undefined) => (n ? new Date(n * 1000) : null);
  return {
    orgId,
    stripeCustomerId: asId(sub.customer as string | { id: string }),
    stripeSubscriptionId: sub.id,
    plan: found?.plan ?? null,
    status: sub.status,
    interval: found?.interval ?? null,
    periodStart: seconds(item?.current_period_start) ?? eventAt,
    periodEnd: seconds(item?.current_period_end) ?? new Date(eventAt.getTime() + 30 * DAY),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    cancelAt: seconds(sub.cancel_at),
    eventAt,
  };
}

const LIVE = new Set<string>(["active", "trialing", "past_due"]);
const ENDED = new Set<string>(["canceled", "unpaid", "incomplete_expired"]);

/** Same day-of-period a month later, clamped to the length of the target month. */
export function addMonthsUtc(from: Date, months: number): Date {
  const d = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth() + months,
      1,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
    ),
  );
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(from.getUTCDate(), lastDay));
  return d;
}

export type SyncResult =
  | { applied: true; plan: Plan; planState: string; planChanged: boolean }
  | { applied: false; reason: "no_org" | "stale" | "other_subscription" | "no_plan" | "pending" };

/**
 * Derives the org's plan, plan state, billing period and payment grace from a subscription
 * snapshot.
 * - `active` / `trialing`: the plan is in effect; `cancel_at_period_end` shows as `canceling`
 *   and schedules the move to Free at period end.
 * - `past_due`: the plan stays (grace); `grace.pastDueSince` starts the 14 days.
 * - `canceled` / `unpaid` / `incomplete_expired`: the org moves to Free.
 * - `incomplete` / `paused`: nothing changes yet.
 * Plan changes go through `applyPlanChange` (connections over the new limit turn read-only,
 * retention notice, audit and notification).
 */
export async function syncSubscription(
  snap: SubscriptionSnapshot,
  options: { now?: Date } = {},
): Promise<SyncResult> {
  await connectDb();
  const now = options.now ?? new Date();
  const orgId = snap.orgId;
  const settings = await OrgSettingsModel.findOne({ orgId }).lean();
  if (!settings) return { applied: false, reason: "no_org" };
  if (settings.stripeSyncedAt && snap.eventAt.getTime() < settings.stripeSyncedAt.getTime()) {
    return { applied: false, reason: "stale" };
  }
  const current = settings.stripeSubscriptionId;
  if (current && current !== snap.stripeSubscriptionId && ENDED.has(snap.status)) {
    // The end of an older subscription must not undo the one that replaced it.
    return { applied: false, reason: "other_subscription" };
  }
  if (!LIVE.has(snap.status) && !ENDED.has(snap.status))
    return { applied: false, reason: "pending" };

  const ended = ENDED.has(snap.status);
  if (!ended && !snap.plan) return { applied: false, reason: "no_plan" };
  const targetPlan: Plan = ended ? "free" : snap.plan!;

  let planChanged = false;
  if (targetPlan !== settings.plan || settings.planState === "trialing") {
    const res = await applyPlanChange(orgId, targetPlan, {
      reason: ended ? "subscription_ended" : "subscription",
      now,
    });
    planChanged = res.applied;
  }

  const canceling = !ended && (snap.cancelAtPeriodEnd || snap.cancelAt !== null);
  const planState = ended
    ? "free"
    : snap.status === "past_due"
      ? "past_due"
      : canceling
        ? "canceling"
        : "active";

  const $set: Record<string, unknown> = {
    stripeCustomerId: snap.stripeCustomerId,
    stripeSyncedAt: snap.eventAt,
    planState,
  };
  const $unset: Record<string, ""> = {};
  if (ended) {
    $set.billingPeriod = calendarMonth(now);
    $set.billingInterval = null;
    $set.extraConnections = 0;
    $set["grace.pastDueSince"] = null;
    if (current === snap.stripeSubscriptionId) $unset.stripeSubscriptionId = "";
  } else {
    $set.stripeSubscriptionId = snap.stripeSubscriptionId;
    $set.billingInterval = snap.interval;
    $set.stripePeriodEnd = snap.periodEnd;
    // Monthly subscriptions follow Stripe's period. Annual ones keep monthly allowance windows
    // (calendar months, rolled by metering) because the tracked-email allowance is per month.
    if (snap.interval === "month") {
      $set.billingPeriod = { start: snap.periodStart, end: snap.periodEnd };
    }
    if (snap.status === "past_due") {
      if (!settings.grace?.pastDueSince) $set["grace.pastDueSince"] = snap.eventAt;
    } else {
      $set["grace.pastDueSince"] = null;
    }
    if (canceling) {
      const effectiveAt = snap.cancelAt ?? snap.periodEnd;
      $set.pendingChange = {
        toPlan: "free",
        effectiveAt,
        retentionEffectiveAt: new Date(effectiveAt.getTime() + RETENTION_NOTICE_DAYS * DAY),
      };
    } else if (settings.planState === "canceling" && settings.pendingChange?.toPlan === "free") {
      $set.pendingChange = null;
    }
  }
  await OrgSettingsModel.updateOne(
    { orgId },
    { $set, ...(Object.keys($unset).length ? { $unset } : {}) },
    { timestamps: false },
  );

  const changedState = settings.planState !== planState;
  if (changedState || planChanged) {
    await writeAuditLog({
      orgId,
      actor: { type: "system" },
      action: "billing.subscription_synced",
      target: { type: "organization", id: orgId },
      changes: {
        before: { plan: settings.plan, planState: settings.planState },
        after: { plan: targetPlan, planState, status: snap.status },
      },
    });
  }
  return { applied: true, plan: targetPlan, planState, planChanged };
}

/* ------------------------------------------------------------------------------------------ */
/* Invoices                                                                                    */
/* ------------------------------------------------------------------------------------------ */

/** Org that owns a Stripe customer (`org_settings`, else Better Auth's `organization` field). */
export async function findOrgByCustomer(customerId: string): Promise<Types.ObjectId | null> {
  if (!customerId) return null;
  await connectDb();
  const settings = await OrgSettingsModel.findOne(
    { stripeCustomerId: customerId },
    { orgId: 1 },
  ).lean();
  if (settings) return settings.orgId;
  const org = await mongoose.connection
    .collection("organization")
    .findOne({ stripeCustomerId: customerId }, { projection: { _id: 1 } });
  return org ? (org._id as Types.ObjectId) : null;
}

async function orgSlug(orgId: Types.ObjectId) {
  const org = await mongoose.connection.collection("organization").findOne({ _id: orgId });
  return (org?.slug as string | undefined) ?? null;
}

/**
 * A payment failed: the org is `past_due` (banner for Owners, 14 days of grace, Stripe keeps
 * retrying). Orgs on Free have nothing to lose and are left alone.
 */
export async function markPaymentFailed(
  orgId: Types.ObjectId,
  invoice: { id: string },
  now: Date = new Date(),
) {
  await connectDb();
  const slug = await orgSlug(orgId);
  return withTransaction(async (session) => {
    const before = await OrgSettingsModel.findOne({ orgId }, null, { session }).lean();
    if (!before || before.plan === "free") return { updated: false };
    if (before.planState !== "past_due") {
      await OrgSettingsModel.updateOne(
        { orgId },
        { $set: { planState: "past_due" } },
        { session, timestamps: false },
      );
      await writeAuditLog(
        {
          orgId,
          actor: { type: "system" },
          action: "billing.payment_failed",
          target: { type: "organization", id: orgId },
          changes: { before: { planState: before.planState }, after: { planState: "past_due" } },
        },
        { session },
      );
    }
    if (!before.grace?.pastDueSince) {
      await OrgSettingsModel.updateOne(
        { orgId, "grace.pastDueSince": null },
        { $set: { "grace.pastDueSince": now } },
        { session, timestamps: false },
      );
    }
    await createNotifications(
      {
        orgId,
        type: "payment_failed",
        title: "We couldn't charge your payment method",
        body: `Update your payment method within ${PAYMENT_GRACE_DAYS} days to keep your plan. Stripe keeps retrying in the meantime.`,
        link: slug ? `/${slug}/settings/billing` : "/",
        audience: { permission: "billing:manage" },
        dedupKey: `payment_failed:${invoice.id}`,
        now,
      },
      { session },
    );
    return { updated: true };
  });
}

/** An invoice was paid: a `past_due` org is back to normal. */
export async function markInvoicePaid(orgId: Types.ObjectId) {
  await connectDb();
  const before = await OrgSettingsModel.findOne({ orgId }).lean();
  if (!before || before.planState !== "past_due") return { updated: false };
  const canceling = before.pendingChange?.toPlan === "free";
  await OrgSettingsModel.updateOne(
    { orgId, planState: "past_due" },
    { $set: { planState: canceling ? "canceling" : "active", "grace.pastDueSince": null } },
    { timestamps: false },
  );
  await writeAuditLog({
    orgId,
    actor: { type: "system" },
    action: "billing.payment_recovered",
    target: { type: "organization", id: orgId },
    changes: { before: { planState: "past_due" }, after: { planState: "active" } },
  });
  return { updated: true };
}

/**
 * Orgs still unpaid after the grace period move to Free under the downgrade rules (PRICING §6
 * "Payment failure"). The Stripe subscription is left alone: if the invoice is paid later, the
 * subscription update brings the org back to its plan.
 */
export async function expirePaymentGrace(now: Date = new Date()) {
  await connectDb();
  const due = await OrgSettingsModel.find(
    {
      planState: "past_due",
      "grace.pastDueSince": { $lte: new Date(now.getTime() - PAYMENT_GRACE_DAYS * DAY) },
      deletedAt: null,
    },
    { orgId: 1 },
  ).lean();
  let moved = 0;
  for (const s of due) {
    const res = await applyPlanChange(s.orgId, "free", { reason: "payment_failed", now });
    await OrgSettingsModel.updateOne(
      { orgId: s.orgId },
      { $set: { "grace.pastDueSince": null } },
      { timestamps: false },
    );
    if (res.applied) moved += 1;
  }
  return { moved };
}
