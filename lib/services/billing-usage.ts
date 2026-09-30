import "server-only";

import { getStripe } from "@/lib/billing/stripe";
import { OVERAGE_UNIT_EMAILS, isPaidPlan, overageMeterEvent } from "@/lib/billing/stripe-prices";
import { connectDb } from "@/lib/db/connect";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { UsagePeriodModel } from "@/lib/db/models/usage-periods";
import { env } from "@/lib/env";

/**
 * Overage reporting (PRICING §6 "Over allowance, paid plan", TRD §2.10 `report-usage`).
 *
 * `usage_periods.overage.emails` is the running total of tracked emails above the allowance.
 * One Billing Meter unit is 10,000 of them, rounded up (the next unit starts with the first
 * email past the previous multiple). Every unit is reported as its own meter event whose
 * `identifier` names the org, the period and the unit number, so a retried or repeated run can
 * never bill a unit twice, however far a crashed run got. `overage.reportedToStripe` records
 * how many units Stripe has, and only ever moves forward.
 *
 * The meter (and price) of the org's current tier is used, so a mid-period tier change bills
 * the remaining usage at the new tier's rate.
 */

const DAY = 86_400_000;
/** Units sent per run and org at most (a first report after a long outage stays bounded). */
const MAX_UNITS_PER_RUN = 500;

export const overageUnits = (overageEmails: number) =>
  overageEmails > 0 ? Math.ceil(overageEmails / OVERAGE_UNIT_EMAILS) : 0;

export const overageIdentifier = (orgId: string, periodStart: Date, unit: number) =>
  `wm-overage-${orgId}-${periodStart.getTime()}-${unit}`;

export type ReportUsageResult = {
  orgs: number;
  units: number;
  errors: number;
};

export async function reportOverageUsage(now: Date = new Date()): Promise<ReportUsageResult> {
  const result: ReportUsageResult = { orgs: 0, units: 0, errors: 0 };
  if (!env.BILLING_ENABLED) return result;
  await connectDb();
  // Current periods and ones that closed in the last days (a late run still reports them).
  const periods = await UsagePeriodModel.find({
    "overage.emails": { $gt: 0 },
    periodEnd: { $gt: new Date(now.getTime() - 3 * DAY) },
  }).lean();
  const stripe = getStripe();

  for (const period of periods) {
    const settings = await OrgSettingsModel.findOne(
      { orgId: period.orgId },
      { plan: 1, planState: 1, stripeCustomerId: 1, stripeSubscriptionId: 1 },
    ).lean();
    if (
      !settings?.stripeCustomerId ||
      !settings.stripeSubscriptionId ||
      !isPaidPlan(settings.plan) ||
      settings.planState === "free"
    ) {
      continue;
    }
    const target = overageUnits(period.overage?.emails ?? 0);
    const reported = period.overage?.reportedToStripe ?? 0;
    if (target <= reported) continue;

    let done = reported;
    try {
      for (
        let unit = reported + 1;
        unit <= target && unit <= reported + MAX_UNITS_PER_RUN;
        unit++
      ) {
        await stripe.billing.meterEvents.create({
          event_name: overageMeterEvent(settings.plan),
          payload: { stripe_customer_id: settings.stripeCustomerId, value: "1" },
          identifier: overageIdentifier(period.orgId.toHexString(), period.periodStart, unit),
          timestamp: Math.floor(Math.min(now.getTime(), Date.now()) / 1000),
        });
        done = unit;
      }
    } catch (error) {
      result.errors += 1;
      console.error("[billing] could not report overage usage", error);
    }
    if (done > reported) {
      // Forward only: a concurrent run that got further wins.
      await UsagePeriodModel.updateOne(
        { _id: period._id, "overage.reportedToStripe": { $lt: done } },
        { $set: { "overage.reportedToStripe": done, "overage.lastReportedAt": now } },
        { timestamps: false },
      );
      result.units += done - reported;
      result.orgs += 1;
    }
  }
  return result;
}
