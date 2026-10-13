import "server-only";

import type { ClientSession, Types } from "mongoose";

import { computeEntitlements } from "@/lib/billing/entitlements";
import { FREE_GRACE_DAYS, FREE_OVER_ALLOWANCE_RETENTION_DAYS } from "@/lib/billing/plans";
import { EmailModel } from "@/lib/db/models/emails";
import { OrgSettingsModel, calendarMonth } from "@/lib/db/models/org-settings";
import { UsagePeriodModel, type UsageStream } from "@/lib/db/models/usage-periods";

/**
 * Tracked-email metering (PRICING §3 and §6, TRD §2.10). A tracked email is counted once per
 * billing period: `emails.meteredAt` is claimed with a conditional update, and only the caller
 * that wins the claim `$inc`s `usage_periods`. Run it in the same transaction as the event
 * processing so duplicate, retried and out-of-order events can never double count.
 *
 * Ingest never stops (PRICING §3 "Never drop data"). Over the allowance:
 * - paid plans: keep counting; `overage.emails` is billed at period end (Phase 8),
 * - Free: the first email over the allowance starts a 7-day grace period; after it, each
 *   further excess email is stored with 7-day retention (`overAllowance`, short `expireAt`).
 */

const DAY = 86_400_000;

type Options = { session?: ClientSession; now?: Date };

export const dayKey = (at: Date) => at.toISOString().slice(0, 10);

/**
 * The org's billing period containing `now`. Calendar month during the beta and on Free (Stripe
 * periods arrive in Phase 8); a stale period is rolled forward, which also restarts the Free
 * grace period.
 */
export async function ensureBillingPeriod(orgId: Types.ObjectId, options: Options = {}) {
  const now = options.now ?? new Date();
  const settings = await OrgSettingsModel.findOne({ orgId }, null, {
    session: options.session,
  }).lean();
  if (!settings) return null;
  if (settings.billingPeriod.end.getTime() > now.getTime()) return settings;
  const next = calendarMonth(now);
  const rolled = await OrgSettingsModel.findOneAndUpdate(
    { orgId, "billingPeriod.end": settings.billingPeriod.end },
    { $set: { billingPeriod: next, "grace.overAllowanceSince": null } },
    { session: options.session, returnDocument: "after", timestamps: false },
  ).lean();
  // Someone else rolled it first: read theirs.
  return (
    rolled ?? (await OrgSettingsModel.findOne({ orgId }, null, { session: options.session }).lean())
  );
}

export type MeterResult =
  { counted: false } | { counted: true; total: number; allowance: number; overAllowance: boolean };

export async function meterEmail(
  input: { orgId: Types.ObjectId; emailId: Types.ObjectId; stream: UsageStream },
  options: Options = {},
): Promise<MeterResult> {
  const { session } = options;
  const now = options.now ?? new Date();

  const claim = await EmailModel.updateOne(
    { _id: input.emailId, orgId: input.orgId, meteredAt: null },
    { $set: { meteredAt: now } },
    { session, timestamps: false },
  );
  if (claim.modifiedCount === 0) return { counted: false };

  const settings = await ensureBillingPeriod(input.orgId, { session, now });
  if (!settings) return { counted: false };
  const e = computeEntitlements(settings, now);
  const allowance = e.limits.emailsTrackedPerMonth;
  const { start, end } = settings.billingPeriod;

  const period = await UsagePeriodModel.findOneAndUpdate(
    { orgId: input.orgId, periodStart: start },
    {
      $setOnInsert: { periodEnd: end, plan: e.plan },
      $set: { allowance },
      $inc: {
        [`emailsTracked.${input.stream}`]: 1,
        [`daily.${dayKey(now)}.${input.stream}`]: 1,
      },
    },
    { upsert: true, returnDocument: "after", session },
  ).lean();

  const t = period!.emailsTracked;
  const total = (t?.transactional ?? 0) + (t?.broadcast ?? 0) + (t?.inbound ?? 0);
  if (total <= allowance) return { counted: true, total, allowance, overAllowance: false };

  await UsagePeriodModel.updateOne(
    { _id: period!._id },
    { $max: { "overage.emails": total - allowance } },
    { session, timestamps: false },
  );

  let overAllowance = false;
  if (e.plan === "free") {
    let since = settings.grace?.overAllowanceSince ?? null;
    if (!since) {
      const started = await OrgSettingsModel.updateOne(
        { orgId: input.orgId, "grace.overAllowanceSince": null },
        { $set: { "grace.overAllowanceSince": now } },
        { session, timestamps: false },
      );
      since = started.modifiedCount > 0 ? now : null;
    }
    if (since && now.getTime() >= since.getTime() + FREE_GRACE_DAYS * DAY) {
      overAllowance = true;
      await EmailModel.updateOne(
        { _id: input.emailId },
        {
          $set: {
            overAllowance: true,
            expireAt: new Date(now.getTime() + FREE_OVER_ALLOWANCE_RETENTION_DAYS * DAY),
          },
        },
        { session, timestamps: false },
      );
    }
  }
  return { counted: true, total, allowance, overAllowance };
}

export const trackedTotal = (
  t?: null | {
    transactional?: number;
    broadcast?: number;
    inbound?: number;
  },
) => (t?.transactional ?? 0) + (t?.broadcast ?? 0) + (t?.inbound ?? 0);
