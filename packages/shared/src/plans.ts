/**
 * Plan catalog types, default seed values, and pure helpers (PRICING.md §3, TRD §2.10).
 * Safe for client and API. Runtime source of truth will move to Mongo + admin (migration M5);
 * until then `DEFAULT_PLAN_CATALOG` / `PLAN_CATALOG` are the seed defaults.
 */

export const PLANS = ["free", "pro", "team", "agency"] as const;
export type Plan = (typeof PLANS)[number];

/** Numeric limits. `null` = unlimited. */
export type PlanLimits = {
  connections: number;
  members: number | null;
  projects: number | null;
  alertRules: number | null;
  emailsTrackedPerMonth: number;
  retentionDays: number;
  aiCreditsPerMonth: number;
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
  tagline: string;
  priceMonthly: number;
  priceAnnualPerMonth: number;
  limits: PlanLimits;
  features: PlanFeatures;
  overagePer10kUsd: number | null;
  extraConnectionUsd: number | null;
  support: string;
};

export type PlanCatalog = Record<Plan, PlanCatalogEntry>;

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

/** Seed / fallback catalog until platform settings are DB-backed. */
export const DEFAULT_PLAN_CATALOG: PlanCatalog = {
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

/** Alias kept for existing call sites; prefer `DEFAULT_PLAN_CATALOG` or an injected catalog. */
export const PLAN_CATALOG = DEFAULT_PLAN_CATALOG;

export const PLAN_ORDER: readonly Plan[] = ["free", "pro", "team", "agency"];

export function planLabels(catalog: PlanCatalog = DEFAULT_PLAN_CATALOG): Record<Plan, string> {
  return {
    free: catalog.free.label,
    pro: catalog.pro.label,
    team: catalog.team.label,
    agency: catalog.agency.label,
  };
}

export const PLAN_LABELS: Record<Plan, string> = planLabels();

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
/** Payment failure: days a subscription may stay unpaid before the org moves to Free. */
export const PAYMENT_GRACE_DAYS = 14;

export const paymentGraceEnds = (pastDueSince: Date | null | undefined) =>
  pastDueSince ? new Date(pastDueSince.getTime() + PAYMENT_GRACE_DAYS * 86_400_000) : null;

/** Usage thresholds (percent of allowance) that notify Owners and Admins. */
export const USAGE_THRESHOLDS = [80, 100] as const;

const NEXT_TIER: Partial<Record<Plan, Plan>> = { free: "pro", pro: "team", team: "agency" };

export function getNextTier(plan: Plan): Plan | null {
  return NEXT_TIER[plan] ?? null;
}

/** Cheapest tier that includes `feature`. */
export function minPlanFor(
  feature: Feature,
  catalog: PlanCatalog = DEFAULT_PLAN_CATALOG,
  order: readonly Plan[] = PLAN_ORDER,
): Plan {
  return order.find((p) => catalog[p].features[feature]) ?? "agency";
}

export type LimitOverrides = Partial<Record<LimitKey, number | null>>;

/** Catalog limits with per-org overrides applied (`null`/missing override = catalog value). */
export function getPlanLimits(
  plan: Plan,
  overrides?: LimitOverrides | null,
  catalog: PlanCatalog = DEFAULT_PLAN_CATALOG,
): PlanLimits {
  const base = catalog[plan].limits;
  const merged = { ...base };
  for (const key of LIMIT_KEYS) {
    const value = overrides?.[key];
    if (value !== undefined && value !== null) {
      (merged as Record<LimitKey, number | null>)[key] = value;
    }
  }
  return merged;
}

export const planHasFeature = (
  plan: Plan,
  feature: Feature,
  catalog: PlanCatalog = DEFAULT_PLAN_CATALOG,
) => catalog[plan].features[feature];

export const planAllowsProjectScopes = (
  plan: Plan,
  catalog: PlanCatalog = DEFAULT_PLAN_CATALOG,
) => planHasFeature(plan, "projectScopedMembers", catalog);

export const planAllowsDigest = (plan: Plan, catalog: PlanCatalog = DEFAULT_PLAN_CATALOG) =>
  planHasFeature(plan, "digests", catalog);

/**
 * Overage in USD for `over` emails above the allowance: rounded up to the next 10k.
 * Free has no overage price (retention cap instead).
 */
export function overageCostUsd(
  plan: Plan,
  over: number,
  catalog: PlanCatalog = DEFAULT_PLAN_CATALOG,
): number {
  const rate = catalog[plan].overagePer10kUsd;
  if (rate === null || over <= 0) return 0;
  return Math.ceil(over / 10_000) * rate;
}
