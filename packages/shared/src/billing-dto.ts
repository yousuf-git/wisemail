/** Client-safe billing / usage DTO shapes (PRD §5.12). */

import type { Plan } from "./plans.js";

export type PlanChangePreviewDTO = {
  toPlan: Plan;
  toLabel: string;
  direction: "upgrade" | "downgrade" | "convert" | "same";
  effectiveAt: string;
  readOnlyConnections: string[];
  lostFeatures: string[];
  retention: { from: number; to: number; effectiveAt: string } | null;
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
    overageCostUsd: number | null;
  };
  overage: {
    emails: number;
    costUsd: number | null;
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
  stripe: {
    fake: boolean;
    interval: "month" | "year" | null;
    hasSubscription: boolean;
    renewsAt: string | null;
    cancelAtPeriodEnd: boolean;
    payment: { pastDue: boolean; graceEndsAt: string | null };
    extraConnections: {
      quantity: number;
      included: number;
      unitUsd: number;
      monthlyUsd: number;
    } | null;
    creditPack: {
      credits: number;
      priceUsd: number;
      available: boolean;
      balance: number;
      maxPacks: number;
    };
    overage: string | null;
  } | null;
};
