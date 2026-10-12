import "server-only";

import { Types, type ClientSession } from "mongoose";
import mongoose from "mongoose";

import { getAiBalance } from "@/lib/ai/credits";
import { computeEntitlements, getEntitlements } from "@/lib/billing/entitlements";
import {
  CREDIT_PACK_CREDITS,
  CREDIT_PACK_PRICE_USD,
  MAX_PACKS_PER_PURCHASE,
} from "@/lib/billing/stripe-prices";
import {
  FEATURES,
  FEATURE_LABELS,
  PLAN_CATALOG,
  PLAN_LABELS,
  PLAN_ORDER,
  RETENTION_NOTICE_DAYS,
  paymentGraceEnds,
  TRIAL_DAYS,
  getPlanLimits,
  type Feature,
} from "@/lib/billing/plans";
import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { ConnectionModel } from "@/lib/db/models/connections";
import { OrgSettingsModel, PLANS, type Plan } from "@/lib/db/models/org-settings";
import { UsagePeriodModel } from "@/lib/db/models/usage-periods";
import { withTransaction } from "@/lib/db/transaction";
import type {
  BillingOverviewDTO,
  PlanChangePreviewDTO,
  PlanChangeResultDTO,
} from "@/lib/dto/billing";
import { env } from "@/lib/env";
import { writeAuditLog } from "./audit";
import { ServiceError } from "./errors";
import { createNotifications } from "./notifications";

/**
 * Plan changes without Stripe (beta, `BILLING_ENABLED=false`). Owners switch plan directly:
 * upgrades apply at once, downgrades are scheduled for the end of the billing period
 * (PRICING §6 "Downgrade"). Connections over the new limit become `read_only` (events keep
 * flowing; sending and management stop), nothing is deleted, and a shorter retention applies
 * after a 14-day notice (`pendingChange.retentionEffectiveAt`, executed by the retention job).
 */

const DAY = 86_400_000;
export const PLAN_LIMIT_REASON = "plan_limit";

const rank = (plan: Plan) => PLAN_ORDER.indexOf(plan);
const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);

/** Direct plan switching is the beta mechanism; with billing on, plans change through Stripe. */
function assertBetaBilling() {
  if (env.BILLING_ENABLED) {
    throw new ServiceError(
      "billing_unavailable",
      "Plan changes go through Stripe checkout and the billing portal.",
    );
  }
}

function assertPlan(value: string): asserts value is Plan {
  if (!(PLANS as readonly string[]).includes(value)) {
    throw new ServiceError("validation", "Pick one of the plans.");
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Preview                                                                                     */
/* ------------------------------------------------------------------------------------------ */

async function liveConnections(orgId: Types.ObjectId, session?: ClientSession) {
  return ConnectionModel.find({ orgId, deletedAt: null, status: { $ne: "disabled" } }, null, {
    session,
  })
    .sort({ _id: 1 })
    .lean();
}

/** What choosing `toPlan` would change (shown before the Owner confirms). */
export async function previewPlanChange(
  ctx: OrgContext,
  toPlanRaw: string,
): Promise<PlanChangePreviewDTO> {
  authorize(ctx, "billing:manage");
  assertPlan(toPlanRaw);
  await connectDb();
  const orgId = orgOid(ctx);
  const e = await getEntitlements(orgId);
  const toPlan = toPlanRaw;
  const target = PLAN_CATALOG[toPlan];
  const direction = classify(e, toPlan);
  const connections = await liveConnections(orgId);
  const limit = target.limits.connections;
  const overLimit = connections.slice(limit);
  const lost = FEATURES.filter((f) => e.features[f] && !target.features[f]).map(
    (f) => FEATURE_LABELS[f as Feature],
  );
  const now = new Date();
  const effectiveAt = direction === "downgrade" && !e.trial?.active ? e.billingPeriod.end : now;
  const fromRetention = e.limits.retentionDays;
  return {
    toPlan,
    toLabel: PLAN_LABELS[toPlan],
    direction,
    effectiveAt: effectiveAt.toISOString(),
    readOnlyConnections: direction === "downgrade" ? overLimit.map((c) => c.name) : [],
    lostFeatures: direction === "downgrade" ? lost : [],
    retention:
      target.limits.retentionDays < fromRetention
        ? {
            from: fromRetention,
            to: target.limits.retentionDays,
            effectiveAt: new Date(
              effectiveAt.getTime() + RETENTION_NOTICE_DAYS * DAY,
            ).toISOString(),
          }
        : null,
    memberOverLimit:
      target.limits.members !== null && direction === "downgrade"
        ? await memberExcess(orgId, target.limits.members)
        : 0,
  };
}

async function memberExcess(orgId: Types.ObjectId, limit: number) {
  const count = await mongoose.connection
    .collection("member")
    .countDocuments({ organizationId: orgId });
  return Math.max(0, count - limit);
}

function classify(
  e: { plan: Plan; storedPlan: Plan; trial: { active: boolean } | null },
  toPlan: Plan,
): "upgrade" | "downgrade" | "convert" | "same" {
  if (e.trial?.active) {
    // Trial acts like Pro: choosing Pro converts it, anything above upgrades, Free ends it.
    if (toPlan === e.storedPlan) return "convert";
    return rank(toPlan) > rank(e.storedPlan) ? "upgrade" : "downgrade";
  }
  if (toPlan === e.storedPlan) return "same";
  return rank(toPlan) > rank(e.storedPlan) ? "upgrade" : "downgrade";
}

/* ------------------------------------------------------------------------------------------ */
/* Owner actions                                                                               */
/* ------------------------------------------------------------------------------------------ */

/** Owner switches plan (beta: no payment). Upgrades apply now, downgrades at period end. */
export async function changePlan(ctx: OrgContext, toPlanRaw: string): Promise<PlanChangeResultDTO> {
  authorize(ctx, "billing:manage");
  assertPlan(toPlanRaw);
  assertBetaBilling();
  await connectDb();
  const orgId = orgOid(ctx);
  const toPlan = toPlanRaw;
  const e = await getEntitlements(orgId);
  const direction = classify(e, toPlan);
  if (direction === "same") {
    if (e.pendingChange) {
      await cancelPendingChange(ctx);
      return { status: "cancelled_pending", plan: toPlan, effectiveAt: null };
    }
    throw new ServiceError("validation", `You are already on ${PLAN_LABELS[toPlan]}.`);
  }

  // Trial to Free ends the trial now; a paid period is honoured until it ends.
  if (direction === "downgrade" && !e.trial?.active) {
    const effectiveAt = e.billingPeriod.end;
    await withTransaction(async (session) => {
      await OrgSettingsModel.updateOne(
        { orgId },
        {
          $set: {
            pendingChange: {
              toPlan,
              effectiveAt,
              retentionEffectiveAt: new Date(effectiveAt.getTime() + RETENTION_NOTICE_DAYS * DAY),
            },
          },
        },
        { session },
      );
      await writeAuditLog(
        {
          orgId,
          actor: { type: "user", id: new Types.ObjectId(ctx.user.id) },
          action: "plan.downgrade_scheduled",
          target: { type: "organization", id: orgId },
          changes: { before: { plan: e.storedPlan }, after: { plan: toPlan, effectiveAt } },
        },
        { session },
      );
    });
    return { status: "scheduled", plan: toPlan, effectiveAt: effectiveAt.toISOString() };
  }

  await applyPlanChange(orgId, toPlan, {
    actorId: new Types.ObjectId(ctx.user.id),
    reason: direction === "downgrade" ? "trial_cancelled" : "owner",
  });
  return { status: "applied", plan: toPlan, effectiveAt: new Date().toISOString() };
}

export async function cancelPendingChange(ctx: OrgContext): Promise<void> {
  authorize(ctx, "billing:manage");
  await connectDb();
  const orgId = orgOid(ctx);
  await withTransaction(async (session) => {
    const before = await OrgSettingsModel.findOneAndUpdate(
      { orgId, "pendingChange.effectiveAt": { $gt: new Date() } },
      { $set: { pendingChange: null } },
      { session, returnDocument: "before", timestamps: false },
    ).lean();
    if (!before?.pendingChange) return;
    await writeAuditLog(
      {
        orgId,
        actor: { type: "user", id: new Types.ObjectId(ctx.user.id) },
        action: "plan.downgrade_cancelled",
        target: { type: "organization", id: orgId },
        changes: { before: { pendingPlan: before.pendingChange.toPlan } },
      },
      { session },
    );
  });
}

/**
 * Starts the 14-day Pro trial (once per org, no card). The trial is ours, not a Stripe trial, so
 * it works the same with billing on: subscribing during the trial simply replaces it.
 */
export async function startTrial(ctx: OrgContext): Promise<void> {
  authorize(ctx, "billing:manage");
  await connectDb();
  const orgId = orgOid(ctx);
  const now = new Date();
  await withTransaction(async (session) => {
    const res = await OrgSettingsModel.updateOne(
      { orgId, plan: "free", trial: null },
      {
        $set: {
          plan: "pro",
          planState: "trialing",
          trial: { startedAt: now, endsAt: new Date(now.getTime() + TRIAL_DAYS * DAY) },
          pendingChange: null,
          "grace.overAllowanceSince": null,
        },
      },
      { session },
    );
    if (res.modifiedCount === 0) {
      throw new ServiceError(
        "conflict",
        "The Pro trial is only available once, and only on the Free plan.",
      );
    }
    await syncUsageAllowance(orgId, "pro", session);
    await restoreConnections(orgId, PLAN_CATALOG.pro.limits.connections, session);
    await writeAuditLog(
      {
        orgId,
        actor: { type: "user", id: new Types.ObjectId(ctx.user.id) },
        action: "plan.trial_started",
        target: { type: "organization", id: orgId },
        changes: { after: { plan: "pro", trialDays: TRIAL_DAYS } },
      },
      { session },
    );
  });
}

/* ------------------------------------------------------------------------------------------ */
/* Applying a change (owner upgrade, scheduled downgrade, trial end)                           */
/* ------------------------------------------------------------------------------------------ */

type ApplyOptions = {
  actorId?: Types.ObjectId;
  reason:
    | "owner"
    | "scheduled"
    | "trial_ended"
    | "trial_cancelled"
    | "subscription"
    | "subscription_ended"
    | "payment_failed"
    | "admin";
  now?: Date;
};

export async function syncUsageAllowance(orgId: Types.ObjectId, plan: Plan, session: ClientSession) {
  const settings = await OrgSettingsModel.findOne({ orgId }, null, { session }).lean();
  if (!settings) return;
  const e = computeEntitlements(settings);
  await UsagePeriodModel.updateOne(
    { orgId, periodStart: settings.billingPeriod.start },
    { $set: { allowance: e.limits.emailsTrackedPerMonth, plan } },
    { session, timestamps: false },
  );
}

/** Oldest live connections up to `limit` that plan limits had frozen become active again. */
export async function restoreConnections(orgId: Types.ObjectId, limit: number, session: ClientSession) {
  const conns = await liveConnections(orgId, session);
  const room = Math.max(0, limit);
  const keep = conns.slice(0, room);
  const restore = keep.filter(
    (c) => c.status === "read_only" && c.statusReason === PLAN_LIMIT_REASON,
  );
  if (restore.length === 0) return 0;
  for (const c of restore) {
    await ConnectionModel.updateOne(
      { _id: c._id },
      {
        $set: { status: c.webhook?.resendId ? "active" : "needs_attention" },
        $unset: { statusReason: "" },
      },
      { session },
    );
  }
  return restore.length;
}

/** Connections beyond `limit` (oldest stay) turn read-only; returns their names. */
async function freezeConnections(orgId: Types.ObjectId, limit: number, session: ClientSession) {
  const conns = await liveConnections(orgId, session);
  const excess = conns.slice(limit).filter((c) => c.status !== "read_only");
  for (const c of excess) {
    await ConnectionModel.updateOne(
      { _id: c._id },
      { $set: { status: "read_only", statusReason: PLAN_LIMIT_REASON } },
      { session },
    );
  }
  return excess.map((c) => c.name);
}

/**
 * Moves the org to `toPlan` now. Internal: callers check permissions (owner action) or are jobs.
 * Idempotent when the plan is already `toPlan` and no trial is running.
 */
export async function applyPlanChange(
  orgId: Types.ObjectId,
  toPlan: Plan,
  options: ApplyOptions,
): Promise<{ applied: boolean; frozen: string[]; restored: number }> {
  await connectDb();
  const now = options.now ?? new Date();
  const result = await withTransaction(async (session) => {
    const before = await OrgSettingsModel.findOne({ orgId }, null, { session }).lean();
    if (!before)
      return { applied: false, frozen: [] as string[], restored: 0, from: "free" as Plan };
    const from = before.plan as Plan;
    const wasTrialing = before.planState === "trialing";
    if (from === toPlan && !wasTrialing) {
      return { applied: false, frozen: [] as string[], restored: 0, from };
    }
    // Compare against the plan as stored: an expired trial that this call ends is still a
    // downgrade from Pro, even though entitlements already treat it as Free.
    const oldLimits = getPlanLimits(from, before.limitOverrides as never);
    const target = PLAN_CATALOG[toPlan];
    const shorter = target.limits.retentionDays < oldLimits.retentionDays;
    const downgrade = rank(toPlan) < rank(from);

    await OrgSettingsModel.updateOne(
      { orgId },
      {
        $set: {
          plan: toPlan,
          planState: toPlan === "free" ? "free" : "active",
          billingInterval: toPlan === "free" ? null : (before.billingInterval ?? "month"),
          // A downgrade keeps a retention notice until the retention job has shortened history.
          pendingChange:
            downgrade && shorter
              ? {
                  toPlan,
                  effectiveAt: now,
                  retentionEffectiveAt: new Date(now.getTime() + RETENTION_NOTICE_DAYS * DAY),
                }
              : null,
          "grace.overAllowanceSince": null,
        },
      },
      { session },
    );
    await syncUsageAllowance(orgId, toPlan, session);

    // Agency keeps the connections it pays extra for (PRICING §6 "Agency extra connections").
    const connectionLimit =
      target.limits.connections + (toPlan === "agency" ? (before.extraConnections ?? 0) : 0);
    const frozen = await freezeConnections(orgId, connectionLimit, session);
    const restored = await restoreConnections(orgId, connectionLimit, session);

    await writeAuditLog(
      {
        orgId,
        actor: options.actorId ? { type: "user", id: options.actorId } : { type: "system" },
        action: "plan.changed",
        target: { type: "organization", id: orgId },
        changes: {
          before: { plan: from, planState: before.planState },
          after: {
            plan: toPlan,
            reason: options.reason,
            ...(frozen.length ? { readOnlyConnections: frozen } : {}),
          },
        },
      },
      { session },
    );

    const org = await mongoose.connection.collection("organization").findOne({ _id: orgId });
    if (org) {
      await createNotifications(
        {
          orgId,
          type: "plan_changed",
          title: `Your plan is now ${PLAN_LABELS[toPlan]}`,
          body:
            frozen.length > 0
              ? `${frozen.length} ${frozen.length === 1 ? "connection is" : "connections are"} read-only until you remove some or upgrade.`
              : undefined,
          link: `/${org.slug as string}/settings/billing`,
          audience: { permission: "billing:manage" },
          dedupKey: `plan_changed:${orgId.toHexString()}:${toPlan}:${now.getTime()}`,
          now,
        },
        { session },
      );
    }
    return { applied: true, frozen, restored, from };
  });
  return { applied: result.applied, frozen: result.frozen, restored: result.restored };
}

/* ------------------------------------------------------------------------------------------ */
/* Jobs                                                                                        */
/* ------------------------------------------------------------------------------------------ */

/**
 * Applies scheduled downgrades whose period ended, and clears retention notices once the notice
 * elapsed (the retention job shortens existing history at that time).
 */
export async function applyDuePlanChanges(now: Date = new Date()) {
  await connectDb();
  const due = await OrgSettingsModel.find(
    { "pendingChange.effectiveAt": { $lte: now }, deletedAt: null },
    { orgId: 1, pendingChange: 1, plan: 1 },
  ).lean();
  let applied = 0;
  let cleared = 0;
  for (const s of due) {
    const pc = s.pendingChange!;
    if (pc.toPlan && pc.toPlan !== s.plan) {
      const res = await applyPlanChange(s.orgId, pc.toPlan as Plan, { reason: "scheduled", now });
      if (res.applied) applied += 1;
    } else if (!pc.retentionEffectiveAt || pc.retentionEffectiveAt <= now) {
      await OrgSettingsModel.updateOne(
        { orgId: s.orgId, "pendingChange.effectiveAt": pc.effectiveAt },
        { $set: { pendingChange: null } },
        { timestamps: false },
      );
      cleared += 1;
    }
  }
  return { applied, cleared };
}

/** Trials past their end without a paid plan move to Free (PRICING §6). */
export async function endExpiredTrials(now: Date = new Date()) {
  await connectDb();
  const expired = await OrgSettingsModel.find(
    { planState: "trialing", "trial.endsAt": { $lte: now }, deletedAt: null },
    { orgId: 1 },
  ).lean();
  let ended = 0;
  for (const s of expired) {
    const res = await applyPlanChange(s.orgId, "free", { reason: "trial_ended", now });
    if (res.applied) ended += 1;
  }
  return { ended };
}

/** Owners hear about the trial 3 days before and on the last day (UCD UC-28). */
export async function notifyTrialEnding(now: Date = new Date()) {
  await connectDb();
  const soon = await OrgSettingsModel.find(
    {
      planState: "trialing",
      "trial.endsAt": { $gt: now, $lte: new Date(now.getTime() + 3 * DAY) },
      deletedAt: null,
    },
    { orgId: 1, trial: 1 },
  ).lean();
  let sent = 0;
  for (const s of soon) {
    const endsAt = s.trial!.endsAt!;
    const lastDay = endsAt.getTime() - now.getTime() <= DAY;
    const org = await mongoose.connection.collection("organization").findOne({ _id: s.orgId });
    if (!org) continue;
    const result = await createNotifications({
      orgId: s.orgId,
      type: "trial_ending",
      title: lastDay
        ? "Your Pro trial ends today"
        : `Your Pro trial ends in ${Math.ceil((endsAt.getTime() - now.getTime()) / DAY)} days`,
      body: "Pick a plan to keep Pro features, or the workspace moves to Free.",
      link: `/${org.slug as string}/settings/billing`,
      audience: { permission: "billing:manage" },
      dedupKey: `trial_ending:${s.orgId.toHexString()}:${lastDay ? "0d" : "3d"}`,
      now,
    });
    sent += result.created.length;
  }
  return { sent };
}

/* ------------------------------------------------------------------------------------------ */
/* Billing page data                                                                           */
/* ------------------------------------------------------------------------------------------ */

const nf = new Intl.NumberFormat("en-US");
const orNone = (n: number | null, one: string, many: string) =>
  n === null ? `Unlimited ${many}` : `${nf.format(n)} ${n === 1 ? one : many}`;

function highlights(plan: Plan): string[] {
  const { limits, features } = PLAN_CATALOG[plan];
  const list = [
    `${nf.format(limits.emailsTrackedPerMonth)} tracked emails a month`,
    `${limits.connections} Resend ${limits.connections === 1 ? "connection" : "connections"}${plan === "agency" ? ", then $5 each" : ""}`,
    orNone(limits.members, "member", "members"),
    orNone(limits.projects, "project", "projects"),
    orNone(limits.alertRules, "alert rule", "alert rules"),
    `${limits.retentionDays >= 365 ? `${limits.retentionDays / 365} ${limits.retentionDays === 365 ? "year" : "years"}` : `${limits.retentionDays} days`} of history`,
    features.ai ? `${nf.format(limits.aiCreditsPerMonth)} AI credits a month` : "No AI credits",
  ];
  if (features.inboxCollaboration) list.push("Assignment, labels and internal notes");
  if (features.chatAlertChannels) list.push("Slack and Discord alerts");
  if (features.digests) list.push("Daily digests and saved views");
  if (features.projectScopedMembers) list.push("Project-scoped members (client access)");
  if (features.auditLog) {
    list.push(
      `Audit log, ${limits.auditLogDays === 365 ? "1 year" : `${limits.auditLogDays} days`}`,
    );
  }
  return list;
}

async function stripeOverview(
  orgId: Types.ObjectId,
  e: Awaited<ReturnType<typeof getEntitlements>>,
  settings: {
    stripeSubscriptionId?: string | null;
    billingInterval?: "month" | "year" | null;
    stripePeriodEnd?: Date | null;
    extraConnections?: number | null;
    grace?: { pastDueSince?: Date | null } | null;
  } | null,
): Promise<BillingOverviewDTO["stripe"]> {
  if (!env.BILLING_ENABLED) return null;
  const agency = e.plan === "agency";
  const extra = Math.max(0, settings?.extraConnections ?? 0);
  const unit = PLAN_CATALOG.agency.extraConnectionUsd ?? 5;
  const balance = e.features.ai ? await getAiBalance(orgId).catch(() => null) : null;
  const graceEnds = paymentGraceEnds(settings?.grace?.pastDueSince);
  return {
    fake: env.STRIPE_MODE === "fake",
    interval: settings?.billingInterval ?? null,
    hasSubscription: !!settings?.stripeSubscriptionId,
    renewsAt:
      settings?.stripeSubscriptionId && settings.stripePeriodEnd
        ? settings.stripePeriodEnd.toISOString()
        : null,
    cancelAtPeriodEnd: e.planState === "canceling",
    payment: {
      pastDue: e.planState === "past_due",
      graceEndsAt: e.planState === "past_due" && graceEnds ? graceEnds.toISOString() : null,
    },
    extraConnections: agency
      ? {
          quantity: extra,
          included: PLAN_CATALOG.agency.limits.connections,
          unitUsd: unit,
          monthlyUsd: extra * unit,
        }
      : null,
    creditPack: {
      credits: CREDIT_PACK_CREDITS,
      priceUsd: CREDIT_PACK_PRICE_USD,
      available: e.features.ai,
      balance: balance?.packs ?? 0,
      maxPacks: MAX_PACKS_PER_PURCHASE,
    },
    overage:
      e.overagePer10kUsd === null ? null : `$${e.overagePer10kUsd.toFixed(2)} per extra 10k emails`,
  };
}

export async function getBillingOverview(ctx: OrgContext): Promise<BillingOverviewDTO> {
  authorize(ctx, "billing:read");
  await connectDb();
  const orgId = orgOid(ctx);
  const e = await getEntitlements(orgId);
  const settings = await OrgSettingsModel.findOne(
    { orgId },
    {
      trial: 1,
      stripeSubscriptionId: 1,
      stripePeriodEnd: 1,
      billingInterval: 1,
      extraConnections: 1,
      grace: 1,
    },
  ).lean();
  const now = Date.now();
  const pc = e.pendingChange;
  return {
    billingEnabled: env.BILLING_ENABLED,
    currentPlan: e.plan,
    currentLabel: e.planLabel,
    planState: e.planState,
    trial: e.trial?.active
      ? { active: true, endsAt: e.trial.endsAt.toISOString(), daysLeft: e.trial.daysLeft }
      : null,
    trialAvailable: e.plan === "free" && !settings?.trial?.startedAt && !e.trial,
    pendingChange: pc
      ? {
          toPlan: pc.toPlan,
          toLabel: PLAN_LABELS[pc.toPlan],
          effectiveAt: pc.effectiveAt.toISOString(),
          scheduled: pc.effectiveAt.getTime() > now,
          retentionEffectiveAt: pc.retentionEffectiveAt?.toISOString() ?? null,
          retentionTo: PLAN_CATALOG[pc.toPlan].limits.retentionDays,
        }
      : null,
    plans: PLAN_ORDER.map((id) => {
      const p = PLAN_CATALOG[id];
      return {
        id,
        label: p.label,
        tagline: p.tagline,
        priceMonthly: p.priceMonthly,
        priceAnnualPerMonth: p.priceAnnualPerMonth,
        highlights: highlights(id),
        overage:
          p.overagePer10kUsd === null
            ? "Beyond the allowance, extra emails keep 7 days of history"
            : `$${p.overagePer10kUsd.toFixed(2)} per extra 10k emails`,
      };
    }),
    canManage: ctx.can("billing:manage"),
    stripe: await stripeOverview(orgId, e, settings),
  };
}
