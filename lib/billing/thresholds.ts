import "server-only";

import { Types } from "mongoose";
import mongoose from "mongoose";

import { computeEntitlements } from "@/lib/billing/entitlements";
import { ensureBillingPeriod, trackedTotal } from "@/lib/billing/metering";
import { FREE_GRACE_DAYS, USAGE_THRESHOLDS } from "@/lib/billing/plans";
import { connectDb } from "@/lib/db/connect";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { UsagePeriodModel } from "@/lib/db/models/usage-periods";
import { createNotifications } from "@/lib/services/notifications";

/**
 * Hourly safety net for the allowance rules (PRICING §6): rolls stale billing periods, notifies
 * Owners and Admins at 80% and 100% once per period, and starts the Free grace period if the
 * metering path missed it. Ingest is never stopped here.
 */
export async function runUsageThresholds(now: Date = new Date()) {
  await connectDb();
  let notified = 0;
  let rolled = 0;

  // Orgs that had no email this period never get a `usage_periods` row: only roll their period.
  const stale = await OrgSettingsModel.find(
    { "billingPeriod.end": { $lte: now }, deletedAt: null },
    { orgId: 1 },
  ).lean();
  for (const s of stale) {
    await ensureBillingPeriod(s.orgId, { now });
    rolled += 1;
  }

  const periods = UsagePeriodModel.find({ periodEnd: { $gt: now } })
    .lean()
    .cursor();
  for await (const period of periods) {
    const settings = await OrgSettingsModel.findOne({
      orgId: period.orgId,
      deletedAt: null,
    }).lean();
    if (!settings || settings.billingPeriod.start.getTime() !== period.periodStart.getTime())
      continue;
    const e = computeEntitlements(settings, now);
    const allowance = e.limits.emailsTrackedPerMonth;
    const total = trackedTotal(period.emailsTracked);
    if (allowance <= 0) continue;
    const pct = (total / allowance) * 100;

    if (e.plan === "free" && total > allowance && !settings.grace?.overAllowanceSince) {
      await OrgSettingsModel.updateOne(
        { orgId: settings.orgId, "grace.overAllowanceSince": null },
        { $set: { "grace.overAllowanceSince": now } },
        { timestamps: false },
      );
    }

    for (const threshold of USAGE_THRESHOLDS) {
      if (pct < threshold || period.thresholdsNotified?.includes(threshold)) continue;
      // Claim first so concurrent runs notify once.
      const claim = await UsagePeriodModel.updateOne(
        { _id: period._id, thresholdsNotified: { $ne: threshold } },
        { $addToSet: { thresholdsNotified: threshold } },
        { timestamps: false },
      );
      if (claim.modifiedCount === 0) continue;
      const org = await mongoose.connection
        .collection("organization")
        .findOne({ _id: new Types.ObjectId(String(settings.orgId)) });
      if (!org) continue;
      const nf = new Intl.NumberFormat("en-US");
      const paid = e.overagePer10kUsd !== null;
      const result = await createNotifications({
        orgId: settings.orgId,
        type: "usage_threshold",
        title:
          threshold >= 100
            ? "You are over your tracked email allowance"
            : `You have used ${threshold}% of your tracked emails`,
        body:
          threshold >= 100
            ? paid
              ? "Nothing is dropped. Extra emails are billed as overage at the end of the period."
              : `Nothing is dropped. After ${FREE_GRACE_DAYS} days, emails beyond the allowance keep 7 days of history.`
            : `${nf.format(total)} of ${nf.format(allowance)} this period.`,
        link: `/${org.slug as string}/settings/usage`,
        audience: { permission: "usage:read" },
        dedupKey: `usage:${settings.orgId.toHexString()}:${period.periodStart.getTime()}:${threshold}`,
        now,
      });
      notified += result.created.length;
    }
  }
  return { rolled, notified };
}
