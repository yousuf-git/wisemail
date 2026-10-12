/**
 * Plan catalog types and labels shared by web and API.
 * Runtime values (prices, limits, features) load from the database — see platform settings seed.
 * These shapes stay in sync with `docs/PRICING.md`.
 */

export type Plan = "free" | "pro" | "team" | "agency";

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

export const PLAN_ORDER: readonly Plan[] = ["free", "pro", "team", "agency"];
