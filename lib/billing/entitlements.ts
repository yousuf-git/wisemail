import "server-only";

import type { ClientSession, Types } from "mongoose";

import {
  FEATURE_LABELS,
  PLAN_CATALOG,
  PLAN_LABELS,
  TRIAL_AI_CREDITS,
  getNextTier,
  getPlanLimits,
  minPlanFor,
  type CountedResource,
  type Feature,
  type PlanFeatures,
  type PlanLimits,
} from "@/lib/billing/plans";
import { connectDb } from "@/lib/db/connect";
import {
  OrgSettingsModel,
  type OrgSettings,
  type Plan,
  type PlanState,
} from "@/lib/db/models/org-settings";
import { ServiceError } from "@/lib/services/errors";

/**
 * Entitlements: the plan catalog merged with the org's overrides and its trial (TRD §2.10).
 * Everything that asks "may this org do X?" goes through here.
 */

export type Entitlements = {
  /** Plan in effect. An expired trial that the `trial-end` job has not processed yet counts as Free. */
  plan: Plan;
  /** Plan as stored (what billing shows). */
  storedPlan: Plan;
  planLabel: string;
  planState: PlanState;
  nextTier: Plan | null;
  nextTierLabel: string | null;
  trial: { active: boolean; startedAt: Date; endsAt: Date; daysLeft: number } | null;
  limits: PlanLimits;
  features: PlanFeatures;
  overagePer10kUsd: number | null;
  billingPeriod: { start: Date; end: Date };
  pendingChange: { toPlan: Plan; effectiveAt: Date; retentionEffectiveAt: Date | null } | null;
  grace: { overAllowanceSince: Date | null };
};

type SettingsLike = Pick<
  OrgSettings,
  "plan" | "planState" | "trial" | "limitOverrides" | "billingPeriod" | "pendingChange" | "grace"
>;

const DAY = 86_400_000;

/** Pure merge, exported for tests. `settings` null = an org without settings (Free). */
export function computeEntitlements(
  settings: Partial<SettingsLike> | null,
  now: Date = new Date(),
): Entitlements {
  const storedPlan = (settings?.plan ?? "free") as Plan;
  const planState = (settings?.planState ?? "free") as PlanState;
  const trialDoc = settings?.trial?.startedAt && settings.trial.endsAt ? settings.trial : null;
  const trialing = planState === "trialing" && !!trialDoc;
  const trialExpired = trialing && trialDoc!.endsAt!.getTime() <= now.getTime();
  const plan: Plan = trialExpired ? "free" : storedPlan;

  const limits = getPlanLimits(plan, settings?.limitOverrides as never);
  // AI during the trial is capped (PRICING §6); an explicit per-org override wins.
  if (trialing && !trialExpired && settings?.limitOverrides?.aiCreditsPerMonth == null) {
    limits.aiCreditsPerMonth = Math.min(limits.aiCreditsPerMonth, TRIAL_AI_CREDITS);
  }
  const next = getNextTier(plan);
  const pc = settings?.pendingChange;
  const overSince = settings?.grace?.overAllowanceSince ?? null;
  return {
    plan,
    storedPlan,
    planLabel: PLAN_LABELS[plan],
    planState: trialExpired ? "free" : planState,
    nextTier: next,
    nextTierLabel: next ? PLAN_LABELS[next] : null,
    trial: trialDoc
      ? {
          active: trialing && !trialExpired,
          startedAt: trialDoc.startedAt!,
          endsAt: trialDoc.endsAt!,
          daysLeft: Math.max(0, Math.ceil((trialDoc.endsAt!.getTime() - now.getTime()) / DAY)),
        }
      : null,
    limits,
    features: { ...PLAN_CATALOG[plan].features },
    overagePer10kUsd: PLAN_CATALOG[plan].overagePer10kUsd,
    billingPeriod: settings?.billingPeriod
      ? { start: settings.billingPeriod.start, end: settings.billingPeriod.end }
      : calendarPeriod(now),
    pendingChange:
      pc?.toPlan && pc.effectiveAt
        ? {
            toPlan: pc.toPlan as Plan,
            effectiveAt: pc.effectiveAt,
            retentionEffectiveAt: pc.retentionEffectiveAt ?? null,
          }
        : null,
    grace: { overAllowanceSince: overSince },
  };
}

function calendarPeriod(now: Date) {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

type Options = { session?: ClientSession; now?: Date };

export async function getEntitlements(
  orgId: Types.ObjectId,
  options: Options = {},
): Promise<Entitlements> {
  await connectDb();
  const settings = await OrgSettingsModel.findOne({ orgId }, null, {
    session: options.session,
  }).lean();
  return computeEntitlements(settings, options.now);
}

/** History retention in days for the org's plan (override, else catalog). */
export async function getRetentionDays(orgId: Types.ObjectId, options: Options = {}) {
  return (await getEntitlements(orgId, options)).limits.retentionDays;
}

/* ------------------------------------------------------------------------------------------ */
/* Limits                                                                                      */
/* ------------------------------------------------------------------------------------------ */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Same wording the services used before the catalog moved here (tests and UI rely on it). */
export function limitMessage(
  resource: CountedResource,
  e: Pick<Entitlements, "planLabel" | "nextTierLabel">,
  limit: number,
  used: number,
): string {
  const up = (tail: string) => (e.nextTierLabel ? ` Upgrade to ${e.nextTierLabel} ${tail}` : "");
  switch (resource) {
    case "connections":
      return (
        `You've connected ${limit} of ${limit} Resend ${plural(limit, "account", "accounts")} on ${e.planLabel}.` +
        up("to connect more.")
      );
    case "projects":
      return (
        `You've created ${limit} of ${limit} ${plural(limit, "project", "projects")} on ${e.planLabel}.` +
        up("to add more.")
      );
    case "members":
      return (
        `You have ${limit} of ${limit} member seats used on ${e.planLabel} (invitations count).` +
        up("to invite more people.")
      );
    case "alertRules":
      return `You have ${used} of ${limit} alert rules on ${e.planLabel}.` + up("for more.");
  }
}

/**
 * Throws `plan_limit_reached` when creating one more `resource` would exceed the plan (`used` is
 * the current count, computed by the caller inside its own transaction). Nothing existing is
 * ever removed (PRICING §6).
 */
export function assertLimitFor(e: Entitlements, resource: CountedResource, used: number): void {
  const limit = e.limits[resource];
  if (limit === null || used < limit) return;
  throw new ServiceError("plan_limit_reached", limitMessage(resource, e, limit, used));
}

export async function assertLimit(
  orgId: Types.ObjectId,
  resource: CountedResource,
  used: number,
  options: Options = {},
): Promise<Entitlements> {
  const e = await getEntitlements(orgId, options);
  assertLimitFor(e, resource, used);
  return e;
}

/* ------------------------------------------------------------------------------------------ */
/* Features                                                                                    */
/* ------------------------------------------------------------------------------------------ */

const LOCK_MESSAGES: Partial<Record<Feature, (e: Entitlements) => string>> = {
  projectScopedMembers: (e) =>
    `Project-scoped members are on ${PLAN_LABELS.team} and above. Your workspace is on ${e.planLabel}.`,
  digests: () => "Daily digests are on Pro and above. Upgrade to get one.",
};

export function lockedMessage(feature: Feature, e: Pick<Entitlements, "planLabel">): string {
  const custom = LOCK_MESSAGES[feature];
  if (custom) return custom(e as Entitlements);
  const min = PLAN_LABELS[minPlanFor(feature)];
  return `${FEATURE_LABELS[feature]} is on ${min} and above. Your workspace is on ${e.planLabel}.`;
}

export function assertFeatureFor(e: Entitlements, feature: Feature): void {
  if (e.features[feature]) return;
  throw new ServiceError("plan_feature_locked", lockedMessage(feature, e));
}

/** Throws `plan_feature_locked` when the org's plan does not include `feature`. */
export async function assertFeature(
  orgId: Types.ObjectId,
  feature: Feature,
  options: Options = {},
): Promise<Entitlements> {
  const e = await getEntitlements(orgId, options);
  assertFeatureFor(e, feature);
  return e;
}
