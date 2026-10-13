import "server-only";

import type { ClientSession, Types } from "mongoose";

import { getEntitlements } from "@/lib/billing/entitlements";
import type { Plan } from "@/lib/db/models/org-settings";

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
  const e = await getEntitlements(orgId, { session: options.session });
  return {
    plan: e.plan,
    storageMode: e.plan === "free" ? "resend" : "r2",
    retentionDays: e.limits.retentionDays,
  };
}

export const expireAtFrom = (from: Date, retentionDays: number) =>
  new Date(from.getTime() + retentionDays * 86_400_000);
