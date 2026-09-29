import type { Plan } from "@/lib/db/models/org-settings";

/**
 * Plan catalog placeholder (PRICING.md §3, TRD §2.10). Phase 7 replaces this with the full
 * catalog (members, projects, retention, feature flags, Stripe prices) and entitlements; only
 * the connection limit is real today.
 */
export type PlanLimits = {
  /** Resend connections included in the plan. */
  connections: number;
  /** Members (PRICING §3). `null` = unlimited. */
  members: number | null;
  /** Projects (PRICING §3). `null` = unlimited. */
  projects: number | null;
  /** Alert rules (PRICING §3). `null` = unlimited. */
  alertRules: number | null;
  /** Tracked emails per month (PRICING §3). */
  emailsTrackedPerMonth: number;
};

const LIMITS: Record<Plan, PlanLimits> = {
  free: { connections: 1, members: 2, projects: 1, alertRules: 3, emailsTrackedPerMonth: 5_000 },
  pro: { connections: 3, members: 5, projects: 5, alertRules: 20, emailsTrackedPerMonth: 75_000 },
  team: {
    connections: 10,
    members: 20,
    projects: null,
    alertRules: null,
    emailsTrackedPerMonth: 500_000,
  },
  // TODO(phase 7): Agency allows a 16th+ connection at $5/month after a confirmation step.
  agency: {
    connections: 15,
    members: null,
    projects: null,
    alertRules: null,
    emailsTrackedPerMonth: 2_000_000,
  },
};

/** Project-scoped members (client access) are on Team and above (PRICING §3). */
const PROJECT_SCOPED_MEMBERS: Record<Plan, boolean> = {
  free: false,
  pro: false,
  team: true,
  agency: true,
};

export const planAllowsProjectScopes = (plan: Plan) => PROJECT_SCOPED_MEMBERS[plan];

/** Digests are on Pro and above (PRICING §3). */
export const planAllowsDigest = (plan: Plan) => plan !== "free";

const NEXT_TIER: Partial<Record<Plan, Plan>> = { free: "pro", pro: "team", team: "agency" };

export const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
  team: "Team",
  agency: "Agency",
};

export function getPlanLimits(
  plan: Plan,
  overrides?: {
    connections?: number | null;
    members?: number | null;
    projects?: number | null;
    alertRules?: number | null;
    emailsTrackedPerMonth?: number | null;
  } | null,
): PlanLimits {
  const base = LIMITS[plan];
  return {
    connections: overrides?.connections ?? base.connections,
    members: overrides?.members ?? base.members,
    projects: overrides?.projects ?? base.projects,
    alertRules: overrides?.alertRules ?? base.alertRules,
    emailsTrackedPerMonth: overrides?.emailsTrackedPerMonth ?? base.emailsTrackedPerMonth,
  };
}

export function getNextTier(plan: Plan): Plan | null {
  return NEXT_TIER[plan] ?? null;
}
