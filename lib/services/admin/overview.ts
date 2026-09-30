import "server-only";

import mongoose from "mongoose";

import { PLAN_LABELS, PLAN_ORDER } from "@/lib/billing/plans";
import { connectDb } from "@/lib/db/connect";
import { ConnectionModel } from "@/lib/db/models/connections";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { SyncRunModel } from "@/lib/db/models/sync-run";
import { WebhookEventModel } from "@/lib/db/models/webhook-events";
import type { AdminOverviewDTO } from "@/lib/dto/admin";
import { getRecentSignups } from "./users";

const DAY = 86_400_000;

/** Cross-tenant counters for the admin landing page. Read-only. */
export async function getOverview(now: Date = new Date()): Promise<AdminOverviewDTO> {
  await connectDb();
  const since24h = new Date(now.getTime() - DAY);
  const since7d = new Date(now.getTime() - 7 * DAY);
  const db = mongoose.connection;
  const live = { deletedAt: null };
  const [
    users,
    organizations,
    activeConnections,
    needsAttentionConnections,
    eventsLast24h,
    failedSyncRuns24h,
    failedEvents24h,
    planRows,
    trialing,
    suspended,
    signupsLast7d,
    recentSignups,
  ] = await Promise.all([
    db.collection("user").estimatedDocumentCount(),
    db.collection("organization").estimatedDocumentCount(),
    ConnectionModel.countDocuments({ ...live, status: "active" }),
    ConnectionModel.countDocuments({ ...live, status: "needs_attention" }),
    WebhookEventModel.countDocuments({ createdAt: { $gte: since24h } }),
    SyncRunModel.countDocuments({ status: "failed", startedAt: { $gte: since24h } }),
    WebhookEventModel.countDocuments({
      createdAt: { $gte: since24h },
      processingError: { $exists: true, $ne: null },
    }),
    OrgSettingsModel.aggregate<{ _id: string; n: number }>([
      { $match: { deletedAt: null } },
      { $group: { _id: "$plan", n: { $sum: 1 } } },
    ]),
    OrgSettingsModel.countDocuments({ deletedAt: null, planState: "trialing" }),
    OrgSettingsModel.countDocuments({ deletedAt: null, suspended: { $ne: null } }),
    db.collection("user").countDocuments({ createdAt: { $gte: since7d } }),
    getRecentSignups(6),
  ]);
  const byPlan = new Map(planRows.map((r) => [r._id, r.n]));
  return {
    counts: {
      users,
      organizations,
      activeConnections,
      needsAttentionConnections,
      eventsLast24h,
      failedSyncRuns24h,
      failedEvents24h,
      signupsLast7d,
    },
    plans: PLAN_ORDER.map((plan) => ({
      plan,
      label: PLAN_LABELS[plan],
      count: byPlan.get(plan) ?? 0,
    })),
    trialing,
    suspended,
    recentSignups,
  };
}
