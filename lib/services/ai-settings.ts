import "server-only";

import mongoose, { Types } from "mongoose";

import { getAiSwitches, type AiSwitches } from "@/lib/ai/access";
import { getAiBalance } from "@/lib/ai/credits";
import type { AiStatusDTO } from "@/lib/ai/types";
import { getEntitlements } from "@/lib/billing/entitlements";
import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { AiUsageModel, type AiFeature } from "@/lib/db/models/ai-usage";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { withTransaction } from "@/lib/db/transaction";
import type { AiSettingsInput } from "@/lib/validation/ai";
import { writeAuditLog } from "./audit";
import { publish } from "@/lib/realtime/publish";

const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);

/** What the UI needs to decide between working buttons, a lock and an "off" note. */
export async function getAiStatus(ctx: OrgContext): Promise<AiStatusDTO> {
  await connectDb();
  const orgId = orgOid(ctx);
  const [entitlements, switches, credits] = await Promise.all([
    getEntitlements(orgId),
    getAiSwitches(orgId),
    getAiBalance(orgId),
  ]);
  return {
    planIncluded: entitlements.features.ai,
    enabled: switches.enabled,
    features: switches.features,
    canUse: ctx.can("ai:use"),
    canConfigure: ctx.can("ai:configure"),
    credits,
    planLabel: entitlements.planLabel,
    nextTierLabel: entitlements.nextTierLabel,
  };
}

/** Owner and Admin only (`ai:configure`). Audited; takes effect immediately, including for jobs. */
export async function updateAiSettings(
  ctx: OrgContext,
  input: AiSettingsInput,
): Promise<AiSwitches> {
  authorize(ctx, "ai:configure");
  await connectDb();
  const orgId = orgOid(ctx);
  const before = await getAiSwitches(orgId);
  const after: AiSwitches = { enabled: input.enabled, features: { ...input.features } };
  await withTransaction(async (session) => {
    await OrgSettingsModel.updateOne({ orgId }, { $set: { ai: after } }, { session });
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      await writeAuditLog(
        {
          orgId,
          actor: { type: "user", id: new Types.ObjectId(ctx.user.id) },
          action: "ai.settings_updated",
          target: { type: "organization", id: orgId },
          changes: { before: { ...before }, after: { ...after } },
        },
        { session },
      );
    }
    await publish({ orgId, topics: ["usage"], patch: null }, { session });
  });
  return after;
}

export type AiUsageRow = {
  id: string;
  at: string;
  feature: AiFeature;
  member: string | null;
  model: string;
  tokens: number;
  credits: number;
};

export type AiUsageSummary = {
  rows: AiUsageRow[];
  byFeature: Record<AiFeature, { calls: number; credits: number }>;
  periodStart: string;
};

/** Usage of the current period for the settings page (`ai:configure`: it names members). */
export async function getAiUsage(
  ctx: OrgContext,
  options: { limit?: number } = {},
): Promise<AiUsageSummary> {
  authorize(ctx, "ai:configure");
  await connectDb();
  const orgId = orgOid(ctx);
  const entitlements = await getEntitlements(orgId);
  const periodStart =
    entitlements.billingPeriod.end.getTime() > Date.now()
      ? entitlements.billingPeriod.start
      : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const [rows, totals] = await Promise.all([
    AiUsageModel.find({ orgId, createdAt: { $gte: periodStart } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(Math.min(options.limit ?? 25, 100))
      .lean(),
    AiUsageModel.aggregate<{ _id: AiFeature; calls: number; credits: number }>([
      { $match: { orgId, createdAt: { $gte: periodStart } } },
      { $group: { _id: "$feature", calls: { $sum: 1 }, credits: { $sum: "$credits" } } },
    ]),
  ]);
  const userIds = [
    ...new Set(rows.map((r) => r.userId?.toHexString()).filter(Boolean)),
  ] as string[];
  const users = userIds.length
    ? await mongoose.connection
        .collection("user")
        .find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
        .project({ name: 1, email: 1 })
        .toArray()
    : [];
  const names = new Map(
    users.map((u) => [String(u._id), (u.name as string) || (u.email as string)]),
  );

  const byFeature = Object.fromEntries(
    (["triage", "draft", "compose", "anomaly"] as const).map((f) => [f, { calls: 0, credits: 0 }]),
  ) as AiUsageSummary["byFeature"];
  for (const t of totals) byFeature[t._id] = { calls: t.calls, credits: t.credits };

  return {
    periodStart: periodStart.toISOString(),
    byFeature,
    rows: rows.map((r) => ({
      id: r._id.toHexString(),
      at: (r as { createdAt: Date }).createdAt.toISOString(),
      feature: r.feature,
      member: r.userId ? (names.get(r.userId.toHexString()) ?? "Former member") : null,
      model: r.model,
      tokens: (r.promptTokens ?? 0) + (r.completionTokens ?? 0),
      credits: r.credits,
    })),
  };
}
