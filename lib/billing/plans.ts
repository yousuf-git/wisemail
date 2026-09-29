import type { Plan } from "@/lib/db/models/org-settings";

/**
 * Plan catalog placeholder (PRICING.md §3, TRD §2.10). Phase 7 replaces this with the full
 * catalog (members, projects, retention, feature flags, Stripe prices) and entitlements; only
 * the connection limit is real today.
 */
export type PlanLimits = {
  /** Resend connections included in the plan. */
  connections: number;
};

const LIMITS: Record<Plan, PlanLimits> = {
  free: { connections: 1 },
  pro: { connections: 3 },
  team: { connections: 10 },
  // TODO(phase 7): Agency allows a 16th+ connection at $5/month after a confirmation step.
  agency: { connections: 15 },
};

const NEXT_TIER: Partial<Record<Plan, Plan>> = { free: "pro", pro: "team", team: "agency" };

export const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
  team: "Team",
  agency: "Agency",
};

export function getPlanLimits(
  plan: Plan,
  overrides?: { connections?: number | null } | null,
): PlanLimits {
  return { connections: overrides?.connections ?? LIMITS[plan].connections };
}

export function getNextTier(plan: Plan): Plan | null {
  return NEXT_TIER[plan] ?? null;
}
