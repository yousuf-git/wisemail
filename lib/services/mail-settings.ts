import "server-only";

import type { ClientSession, Types } from "mongoose";

import { OrgSettingsModel, type Plan } from "@/lib/db/models/org-settings";

/** History retention by plan, in days (PRICING §3). Phase 7 moves this into the plan catalog. */
const RETENTION_DAYS: Record<Plan, number> = { free: 30, pro: 180, team: 365, agency: 730 };

export type MailSettings = {
  plan: Plan;
  /** `r2`: copy inbound files into our bucket (paid and trial); `resend`: serve from Resend (Free). */
  storageMode: "r2" | "resend";
  retentionDays: number;
};

/** Plan-derived mail behaviour for an org (TRD §2.13 storage modes, DBD §1 retention). */
export async function getMailSettings(
  orgId: Types.ObjectId,
  options: { session?: ClientSession } = {},
): Promise<MailSettings> {
  const settings = await OrgSettingsModel.findOne({ orgId }, null, {
    session: options.session,
  }).lean();
  const plan = settings?.plan ?? "free";
  const trialing = settings?.planState === "trialing";
  return {
    plan,
    storageMode: plan === "free" && !trialing ? "resend" : "r2",
    retentionDays: settings?.limitOverrides?.retentionDays ?? RETENTION_DAYS[plan],
  };
}

export const expireAtFrom = (from: Date, retentionDays: number) =>
  new Date(from.getTime() + retentionDays * 86_400_000);
