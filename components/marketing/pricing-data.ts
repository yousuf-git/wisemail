import {
  PLAN_CATALOG,
  PLAN_ORDER,
  TRIAL_DAYS,
  overageCostUsd,
  type Plan,
} from "@/lib/billing/plans";
import { compactCount, formatRetention, usd } from "./format";

export type Interval = "month" | "year";

export const paidPlans = PLAN_ORDER.filter((p) => PLAN_CATALOG[p].priceMonthly > 0);

export const priceFor = (plan: Plan, interval: Interval) =>
  interval === "year" ? PLAN_CATALOG[plan].priceAnnualPerMonth : PLAN_CATALOG[plan].priceMonthly;

/** Dollars saved over a year by paying annually. */
export const annualSavingPerYear = (plan: Plan) => {
  const e = PLAN_CATALOG[plan];
  return (e.priceMonthly - e.priceAnnualPerMonth) * 12;
};

/** The biggest annual discount across paid plans, in whole percent. */
export const maxAnnualSavingPct = () =>
  Math.max(
    ...paidPlans.map((p) => {
      const e = PLAN_CATALOG[p];
      return Math.round((1 - e.priceAnnualPerMonth / e.priceMonthly) * 100);
    }),
  );

export const trialLabel = `${TRIAL_DAYS}-day Pro trial, no card`;

/** Short bullet list for a plan card. */
export function planHighlights(plan: Plan): string[] {
  const { limits: l, extraConnectionUsd } = PLAN_CATALOG[plan];
  const accounts =
    extraConnectionUsd !== null
      ? `${l.connections} Resend accounts, then ${usd(extraConnectionUsd)}/mo each`
      : `${l.connections} Resend account${l.connections === 1 ? "" : "s"}`;
  return [
    `${compactCount(l.emailsTrackedPerMonth)} tracked emails a month`,
    accounts,
    `${formatRetention(l.retentionDays)} of history`,
    l.members === null ? "Unlimited members" : `${l.members} members`,
    l.alertRules === null ? "Unlimited alert rules" : `${l.alertRules} alert rules`,
    l.aiCreditsPerMonth > 0
      ? `${l.aiCreditsPerMonth.toLocaleString("en-US")} AI credits a month`
      : "AI on paid plans",
  ];
}

export type CostExample = {
  label: string;
  resendBillUsd: number;
  trackedEmails: number;
  plan: Plan;
  wisemailUsd: number;
  sharePct: number;
};

/**
 * Worked examples from PRICING.md §3 "Check against Resend spend". The Resend bills are the
 * figures in that table (Resend's public prices, 2026-09); the Wisemail side is computed from the
 * plan catalog so it never drifts from the real prices.
 */
const examples: { label: string; resend: number; tracked: number; plan: Plan }[] = [
  { label: "Indie SaaS on Resend Pro (50k emails)", resend: 20, tracked: 45_000, plan: "pro" },
  {
    label: "Resend Pro plus Marketing Pro (5k contacts), a few broadcasts",
    resend: 60,
    tracked: 65_000,
    plan: "pro",
  },
  {
    label: "Resend Scale (500k) plus Marketing Pro (50k contacts)",
    resend: 600,
    tracked: 700_000,
    plan: "team",
  },
];

export const costExamples: CostExample[] = examples.map((e) => {
  const entry = PLAN_CATALOG[e.plan];
  const over = Math.max(0, e.tracked - entry.limits.emailsTrackedPerMonth);
  const wisemailUsd = entry.priceMonthly + overageCostUsd(e.plan, over);
  return {
    label: e.label,
    resendBillUsd: e.resend,
    trackedEmails: e.tracked,
    plan: e.plan,
    wisemailUsd,
    sharePct: Math.round((wisemailUsd / e.resend) * 100),
  };
});
