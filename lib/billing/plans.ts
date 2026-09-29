import type { Plan } from "@/lib/db/models/org-settings";

/**
 * Plan catalog: the single source of truth for what every tier includes (PRICING.md §3, TRD
 * §2.10). Pure data and helpers, safe for client components. `org_settings` stores only the
 * current plan and per-org overrides; `lib/billing/entitlements.ts` merges both with the trial.
 */

export type { Plan };

/** Numeric limits. `null` = unlimited. */
export type PlanLimits = {
  /** Resend connections included in the plan. */
  connections: number;
  members: number | null;
  projects: number | null;
  alertRules: number | null;
  /** Tracked emails per month (PRICING §3). */
  emailsTrackedPerMonth: number;
  /** History retention for events, inbound content and files. */
  retentionDays: number;
  /** Monthly AI credit allowance; 0 = no AI. */
  aiCreditsPerMonth: number;
  /** How far back the audit log can be read; 0 = no audit log. */
  auditLogDays: number;
};

export const LIMIT_KEYS = [
  "connections",
  "members",
  "projects",
  "alertRules",
  "emailsTrackedPerMonth",
  "retentionDays",
  "aiCreditsPerMonth",
  "auditLogDays",
] as const satisfies readonly (keyof PlanLimits)[];
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** Resources that are counted and blocked at creation (PRICING §6 "Plan limits"). */
export type CountedResource = "connections" | "members" | "projects" | "alertRules";

export const FEATURES = [
  "ai",
  "inboxCollaboration",
  "chatAlertChannels",
  "digests",
  "savedViews",
  "projectScopedMembers",
  "auditLog",
  "apiKeys",
] as const;
export type Feature = (typeof FEATURES)[number];

export type PlanFeatures = Record<Feature, boolean>;

export const FEATURE_LABELS: Record<Feature, string> = {
  ai: "AI assistance",
  inboxCollaboration: "Assignment, labels and internal notes",
  chatAlertChannels: "Slack and Discord alert channels",
  digests: "Daily digests",
  savedViews: "Saved views",
  projectScopedMembers: "Project-scoped members",
  auditLog: "Audit log",
  apiKeys: "API keys",
};

export type PlanCatalogEntry = {
  id: Plan;
  label: string;
  /** Who it is for (billing cards). */
  tagline: string;
  /** USD per month billed monthly / per month billed annually. */
  priceMonthly: number;
  priceAnnualPerMonth: number;
  limits: PlanLimits;
  features: PlanFeatures;
  /** USD per 10,000 tracked emails beyond the allowance (paid tiers), else `null`. */
  overagePer10kUsd: number | null;
  /** Agency: USD per month for each connection beyond the included ones. */
  extraConnectionUsd: number | null;
  support: string;
  // TODO(phase 8): Stripe price ids (plan monthly/annual, extra connection, overage meter).
};

const NONE = {
  ai: false,
  inboxCollaboration: false,
  chatAlertChannels: false,
  digests: false,
  savedViews: false,
  projectScopedMembers: false,
  auditLog: false,
  apiKeys: true,
} satisfies PlanFeatures;

const PRO = {
  ...NONE,
  ai: true,
  inboxCollaboration: true,
  chatAlertChannels: true,
  digests: true,
  savedViews: true,
} satisfies PlanFeatures;

const TEAM = { ...PRO, projectScopedMembers: true, auditLog: true } satisfies PlanFeatures;

export const PLAN_CATALOG: Record<Plan, PlanCatalogEntry> = {
  free: {
    id: "free",
    label: "Free",
    tagline: "Side projects",
    priceMonthly: 0,
    priceAnnualPerMonth: 0,
    limits: {
      connections: 1,
      members: 2,
      projects: 1,
      alertRules: 3,
      emailsTrackedPerMonth: 5_000,
      retentionDays: 30,
      aiCreditsPerMonth: 0,
      auditLogDays: 0,
    },
    features: NONE,
    overagePer10kUsd: null,
    extraConnectionUsd: null,
    support: "Community",
  },
  pro: {
    id: "pro",
    label: "Pro",
    tagline: "Indie devs",
    priceMonthly: 12,
    priceAnnualPerMonth: 10,
    limits: {
      connections: 3,
      members: 5,
      projects: 5,
      alertRules: 20,
      emailsTrackedPerMonth: 75_000,
      retentionDays: 180,
      aiCreditsPerMonth: 1_000,
      auditLogDays: 0,
    },
    features: PRO,
    overagePer10kUsd: 1,
    extraConnectionUsd: null,
    support: "Email",
  },
  team: {
    id: "team",
    label: "Team",
    tagline: "Startup teams",
    priceMonthly: 39,
    priceAnnualPerMonth: 32,
    limits: {
      connections: 10,
      members: 20,
      projects: null,
      alertRules: null,
      emailsTrackedPerMonth: 500_000,
      retentionDays: 365,
      aiCreditsPerMonth: 5_000,
      auditLogDays: 90,
    },
    features: TEAM,
    overagePer10kUsd: 0.75,
    extraConnectionUsd: null,
    support: "Priority email",
  },
  agency: {
    id: "agency",
    label: "Agency",
    tagline: "Agencies",
    priceMonthly: 99,
    priceAnnualPerMonth: 82,
    limits: {
      // TODO(phase 8): a 16th+ connection asks for +$5/month confirmation (Stripe quantity).
      connections: 15,
      members: null,
      projects: null,
      alertRules: null,
      emailsTrackedPerMonth: 2_000_000,
      retentionDays: 730,
      aiCreditsPerMonth: 15_000,
      auditLogDays: 365,
    },
    features: TEAM,
    overagePer10kUsd: 0.5,
    extraConnectionUsd: 5,
    support: "Priority email and an onboarding call",
  },
};

export const PLAN_ORDER: readonly Plan[] = ["free", "pro", "team", "agency"];

export const PLAN_LABELS: Record<Plan, string> = {
  free: PLAN_CATALOG.free.label,
  pro: PLAN_CATALOG.pro.label,
  team: PLAN_CATALOG.team.label,
  agency: PLAN_CATALOG.agency.label,
};

/** Length of the app-side Pro trial (PRICING §6). */
export const TRIAL_DAYS = 14;
/** AI credit cap while trialing (PRICING §6). */
export const TRIAL_AI_CREDITS = 200;
/** Free plan: days over the allowance before excess emails get the short retention. */
export const FREE_GRACE_DAYS = 7;
/** Free plan: retention of emails beyond allowance and grace. */
export const FREE_OVER_ALLOWANCE_RETENTION_DAYS = 7;
/** Downgrade: notice before the shorter retention applies. */
export const RETENTION_NOTICE_DAYS = 14;
/** Usage thresholds (percent of allowance) that notify Owners and Admins. */
export const USAGE_THRESHOLDS = [80, 100] as const;

const NEXT_TIER: Partial<Record<Plan, Plan>> = { free: "pro", pro: "team", team: "agency" };

export function getNextTier(plan: Plan): Plan | null {
  return NEXT_TIER[plan] ?? null;
}

/** Cheapest tier that includes `feature`. */
export function minPlanFor(feature: Feature): Plan {
  return PLAN_ORDER.find((p) => PLAN_CATALOG[p].features[feature]) ?? "agency";
}

export type LimitOverrides = Partial<Record<LimitKey, number | null>>;

/** Catalog limits with per-org overrides applied (`null`/missing override = catalog value). */
export function getPlanLimits(plan: Plan, overrides?: LimitOverrides | null): PlanLimits {
  const base = PLAN_CATALOG[plan].limits;
  const merged = { ...base };
  for (const key of LIMIT_KEYS) {
    const value = overrides?.[key];
    if (value !== undefined && value !== null)
      (merged as Record<LimitKey, number | null>)[key] = value;
  }
  return merged;
}

export const planHasFeature = (plan: Plan, feature: Feature) =>
  PLAN_CATALOG[plan].features[feature];
export const planAllowsProjectScopes = (plan: Plan) => planHasFeature(plan, "projectScopedMembers");
export const planAllowsDigest = (plan: Plan) => planHasFeature(plan, "digests");

/**
 * Overage in USD for `over` emails above the allowance: rounded up to the next 10k (PRICING §6).
 * Free has no overage price (retention cap instead).
 */
export function overageCostUsd(plan: Plan, over: number): number {
  const rate = PLAN_CATALOG[plan].overagePer10kUsd;
  if (rate === null || over <= 0) return 0;
  return Math.ceil(over / 10_000) * rate;
}
