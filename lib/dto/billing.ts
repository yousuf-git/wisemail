import type { Plan } from "@/lib/db/models/org-settings";

/** Client-safe shapes for Settings → Usage / Billing / General (PRD §5.12). */

export type PlanChangePreviewDTO = {
  toPlan: Plan;
  toLabel: string;
  direction: "upgrade" | "downgrade" | "convert" | "same";
  /** When the change takes effect (now for upgrades, period end for downgrades). */
  effectiveAt: string;
  /** Connections that become read-only (downgrade). */
  readOnlyConnections: string[];
  /** Feature names the new plan no longer includes. */
  lostFeatures: string[];
  /** Shorter history retention, applied after a 14-day notice. */
  retention: { from: number; to: number; effectiveAt: string } | null;
  /** Members above the new plan's seat count (they keep access; invites are blocked). */
  memberOverLimit: number;
};

export type PlanChangeResultDTO = {
  status: "applied" | "scheduled" | "cancelled_pending";
  plan: Plan;
  effectiveAt: string | null;
};

export type UsageMeterDTO = {
  key: "connections" | "members" | "projects" | "alertRules";
  label: string;
  used: number;
  /** `null` = unlimited. */
  limit: number | null;
};

export type UsageDayDTO = {
  date: string;
  transactional: number;
  broadcast: number;
  inbound: number;
};

export type UsagePeriodRowDTO = {
  periodStart: string;
  periodEnd: string;
  plan: string;
  allowance: number;
  transactional: number;
  broadcast: number;
  inbound: number;
  total: number;
  overage: number;
};

export type UsageOverviewDTO = {
  plan: { id: Plan; label: string };
  period: { start: string; end: string; daysElapsed: number; daysTotal: number };
  tracked: { transactional: number; broadcast: number; inbound: number; total: number };
  allowance: number;
  daily: UsageDayDTO[];
  projection: {
    monthEnd: number;
    over: number;
    /** Projected overage in USD (paid plans), else `null`. */
    overageCostUsd: number | null;
  };
  overage: {
    emails: number;
    costUsd: number | null;
    /** Free: when the 7-day grace period ends (or ended). */
    graceEndsAt: string | null;
    graceEnded: boolean;
  };
  ai: {
    enabled: boolean;
    allowance: number;
    used: number;
    packs: number;
    byFeature: { feature: string; credits: number }[];
    byMember: { userId: string | null; name: string; credits: number }[];
  };
  resources: UsageMeterDTO[];
  history: UsagePeriodRowDTO[];
};

export type BillingPlanCardDTO = {
  id: Plan;
  label: string;
  tagline: string;
  priceMonthly: number;
  priceAnnualPerMonth: number;
  highlights: string[];
  overage: string | null;
};

export type BillingOverviewDTO = {
  billingEnabled: boolean;
  currentPlan: Plan;
  currentLabel: string;
  planState: string;
  trial: { active: boolean; endsAt: string; daysLeft: number } | null;
  trialAvailable: boolean;
  pendingChange: {
    toPlan: Plan;
    toLabel: string;
    effectiveAt: string;
    scheduled: boolean;
    retentionEffectiveAt: string | null;
    retentionTo: number | null;
  } | null;
  plans: BillingPlanCardDTO[];
  canManage: boolean;
};
