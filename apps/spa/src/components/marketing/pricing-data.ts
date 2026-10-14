import {
  PLAN_CATALOG,
  PLAN_ORDER,
  TRIAL_DAYS,
  type Plan,
} from "@wisemail/shared";

import { compactCount, formatRetention, usd } from "./format";

export type Interval = "month" | "year";

export const paidPlans = PLAN_ORDER.filter((p) => PLAN_CATALOG[p].priceMonthly > 0);

export const priceFor = (plan: Plan, interval: Interval) =>
  interval === "year" ? PLAN_CATALOG[plan].priceAnnualPerMonth : PLAN_CATALOG[plan].priceMonthly;

export const annualSavingPerYear = (plan: Plan) => {
  const e = PLAN_CATALOG[plan];
  return (e.priceMonthly - e.priceAnnualPerMonth) * 12;
};

export const maxAnnualSavingPct = () =>
  Math.max(
    ...paidPlans.map((p) => {
      const e = PLAN_CATALOG[p];
      return Math.round((1 - e.priceAnnualPerMonth / e.priceMonthly) * 100);
    }),
  );

export const trialLabel = `${TRIAL_DAYS}-day Pro trial, no card`;

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
