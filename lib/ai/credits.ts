import "server-only";

import { Types, type ClientSession } from "mongoose";

import { getEntitlements } from "@/lib/billing/entitlements";
import { connectDb } from "@/lib/db/connect";
import { AiUsageModel, type AiFeature } from "@/lib/db/models/ai-usage";
import { OrgSettingsModel, calendarMonth } from "@/lib/db/models/org-settings";
import { withTransaction } from "@/lib/db/transaction";
import { AiError } from "@/lib/ai/errors";
import type { AiBalanceDTO } from "@/lib/ai/types";

/**
 * AI credits (PRICING §3, TRD §2.9): reserve -> commit / release on `org_settings.aiCredits`.
 *
 * - The monthly allowance is used first, purchased packs after it (DBD `aiCredits`).
 * - `reserve` is a single-document conditional update, so concurrent calls can never spend the
 *   same credit twice: no reservation, no call.
 * - `commit` settles the reservation (allowance first, then packs) and writes the `ai_usage` row
 *   in one transaction; `release` gives the reservation back when the call failed.
 */

export type Reservation = { orgId: Types.ObjectId; credits: number };

const num = (path: string) => ({ $ifNull: [path, 0] });
const A = "$aiCredits";

/** Pack credits count unless `packExpiresAt` has passed. */
const packLive = (now: Date) => ({
  $cond: [
    {
      $or: [
        { $eq: [{ $type: `${A}.packExpiresAt` }, "missing"] },
        { $eq: [`${A}.packExpiresAt`, null] },
        { $gt: [`${A}.packExpiresAt`, now] },
      ],
    },
    num(`${A}.packBalance`),
    0,
  ],
});

const allowanceLeft = {
  $max: [0, { $subtract: [num(`${A}.periodAllowance`), num(`${A}.periodUsed`)] }],
};

const available = (now: Date) => ({
  $subtract: [{ $add: [allowanceLeft, packLive(now)] }, num(`${A}.reserved`)],
});

/**
 * Rolls the allowance over when a new period started and follows plan changes. Both writes are
 * conditional on the value that was read, so racing callers cannot reset twice.
 */
export async function syncAiPeriod(orgId: Types.ObjectId, now: Date = new Date()) {
  await connectDb();
  const [entitlements, settings] = await Promise.all([
    getEntitlements(orgId, { now }),
    OrgSettingsModel.findOne({ orgId }, { aiCredits: 1 }).lean(),
  ]);
  const period =
    entitlements.billingPeriod.end.getTime() > now.getTime()
      ? entitlements.billingPeriod
      : calendarMonth(now);
  const allowance = entitlements.features.ai ? entitlements.limits.aiCreditsPerMonth : 0;
  if (!settings) return { entitlements, period, allowance };

  const credits = settings.aiCredits;
  const previous = credits?.periodStart ?? null;
  if (!previous || previous.getTime() !== period.start.getTime()) {
    await OrgSettingsModel.updateOne(
      { orgId, "aiCredits.periodStart": previous },
      {
        $set: {
          "aiCredits.periodStart": period.start,
          "aiCredits.periodUsed": 0,
          "aiCredits.periodAllowance": allowance,
        },
      },
    );
  } else if (credits?.periodAllowance !== allowance) {
    await OrgSettingsModel.updateOne(
      { orgId, "aiCredits.periodAllowance": credits?.periodAllowance ?? 0 },
      { $set: { "aiCredits.periodAllowance": allowance } },
    );
  }
  return { entitlements, period, allowance };
}

export async function getAiBalance(
  orgId: Types.ObjectId,
  now: Date = new Date(),
): Promise<AiBalanceDTO> {
  const { period } = await syncAiPeriod(orgId, now);
  const settings = await OrgSettingsModel.findOne({ orgId }, { aiCredits: 1 }).lean();
  const c = settings?.aiCredits;
  const allowance = c?.periodAllowance ?? 0;
  const used = c?.periodUsed ?? 0;
  const reserved = c?.reserved ?? 0;
  const packs =
    !c?.packExpiresAt || c.packExpiresAt.getTime() > now.getTime() ? (c?.packBalance ?? 0) : 0;
  return {
    allowance,
    used,
    reserved,
    packs,
    available: Math.max(0, Math.max(0, allowance - used) + packs - reserved),
    resetsAt: period.end.toISOString(),
  };
}

/** Holds `credits` for one call. Throws `ai_credits_exhausted` when the balance cannot cover it. */
export async function reserveCredits(
  orgId: Types.ObjectId,
  credits: number,
  now: Date = new Date(),
): Promise<Reservation> {
  await syncAiPeriod(orgId, now);
  const held = await OrgSettingsModel.findOneAndUpdate(
    { orgId, $expr: { $gte: [available(now), credits] } },
    { $inc: { "aiCredits.reserved": credits } },
    { projection: { _id: 1 } },
  ).lean();
  if (!held) throw new AiError("ai_credits_exhausted");
  return { orgId, credits };
}

export type UsageRecord = {
  userId: Types.ObjectId | null;
  feature: AiFeature;
  model: string;
  promptVersion?: string;
  promptTokens: number;
  completionTokens: number;
  refs?: { emailId?: Types.ObjectId; threadId?: Types.ObjectId; incidentId?: Types.ObjectId };
};

/** Settles a reservation: allowance first, then packs, plus the `ai_usage` row. */
export async function commitCredits(
  reservation: Reservation,
  usage: UsageRecord,
  options: { session?: ClientSession } = {},
): Promise<{ fromAllowance: number; fromPack: number }> {
  const { orgId, credits } = reservation;
  const run = async (session: ClientSession) => {
    const before = await OrgSettingsModel.findOneAndUpdate(
      { orgId },
      [
        {
          $set: {
            "aiCredits.periodUsed": {
              $add: [num(`${A}.periodUsed`), { $min: [credits, allowanceLeft] }],
            },
            "aiCredits.packBalance": {
              $max: [
                0,
                {
                  $subtract: [
                    num(`${A}.packBalance`),
                    { $subtract: [credits, { $min: [credits, allowanceLeft] }] },
                  ],
                },
              ],
            },
            "aiCredits.reserved": { $max: [0, { $subtract: [num(`${A}.reserved`), credits] }] },
          },
        },
      ],
      { returnDocument: "before", projection: { aiCredits: 1 }, session, updatePipeline: true },
    ).lean();
    const c = before?.aiCredits;
    const fromAllowance = Math.min(
      credits,
      Math.max(0, (c?.periodAllowance ?? 0) - (c?.periodUsed ?? 0)),
    );
    const fromPack = credits - fromAllowance;
    await AiUsageModel.create(
      [
        {
          orgId,
          userId: usage.userId,
          feature: usage.feature,
          model: usage.model,
          promptVersion: usage.promptVersion,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          credits,
          creditsFrom: { allowance: fromAllowance, pack: fromPack },
          refs: usage.refs ?? {},
        },
      ],
      { session },
    );
    return { fromAllowance, fromPack };
  };
  return options.session ? run(options.session) : withTransaction(run);
}

/** Gives a reservation back (the call failed): nothing is charged, no usage row is written. */
export async function releaseCredits(reservation: Reservation): Promise<void> {
  await OrgSettingsModel.updateOne(
    { orgId: reservation.orgId },
    [
      {
        $set: {
          "aiCredits.reserved": {
            $max: [0, { $subtract: [num(`${A}.reserved`), reservation.credits] }],
          },
        },
      },
    ],
    { updatePipeline: true },
  );
}
