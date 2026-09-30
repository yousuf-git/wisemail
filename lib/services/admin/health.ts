import "server-only";

import mongoose, { Types } from "mongoose";

import { connectDb } from "@/lib/db/connect";
import { ConnectionModel } from "@/lib/db/models/connections";
import { SyncRunModel } from "@/lib/db/models/sync-run";
import { WebhookEventModel } from "@/lib/db/models/webhook-events";
import type { AdminHealthDTO } from "@/lib/dto/admin";
import { env } from "@/lib/env";
import { iso } from "./shared";

const DAY = 86_400_000;
const LIST = 25;

/** Cross-tenant operational view. Read-only; nothing here mutates a tenant. */
export async function getSystemHealth(now: Date = new Date()): Promise<AdminHealthDTO> {
  await connectDb();
  const since24h = new Date(now.getTime() - DAY);
  const sinceHour = new Date(now.getTime() - 3_600_000);
  const stale = new Date(now.getTime() - 5 * 60_000);

  const [
    attention,
    failedSyncs,
    eventsLastHour,
    eventsLast24h,
    failedLast24h,
    backlog,
    timing,
    failedEvents,
  ] = await Promise.all([
    ConnectionModel.find(
      { deletedAt: null, status: { $in: ["needs_attention", "provisioning"] } },
      { name: 1, status: 1, statusReason: 1, orgId: 1, updatedAt: 1, lastEventAt: 1 },
    )
      .sort({ updatedAt: -1 })
      .limit(LIST)
      .lean(),
    SyncRunModel.find({ status: "failed", startedAt: { $gte: since24h } })
      .sort({ startedAt: -1 })
      .limit(LIST)
      .lean(),
    WebhookEventModel.countDocuments({ createdAt: { $gte: sinceHour } }),
    WebhookEventModel.countDocuments({ createdAt: { $gte: since24h } }),
    WebhookEventModel.countDocuments({
      createdAt: { $gte: since24h },
      processingError: { $exists: true, $ne: null },
    }),
    WebhookEventModel.countDocuments({
      createdAt: { $lt: stale },
      processedAt: null,
      ignoredReason: { $exists: false },
    }),
    WebhookEventModel.aggregate<{ avg: number; max: number }>([
      { $match: { createdAt: { $gte: since24h }, processedAt: { $ne: null } } },
      {
        $project: {
          ms: { $max: [0, { $subtract: ["$processedAt", "$createdAt"] }] },
        },
      },
      { $group: { _id: null, avg: { $avg: "$ms" }, max: { $max: "$ms" } } },
    ]),
    WebhookEventModel.find(
      { createdAt: { $gte: since24h }, processingError: { $exists: true, $ne: null } },
      { type: 1, orgId: 1, processingError: 1, createdAt: 1 },
    )
      .sort({ createdAt: -1 })
      .limit(LIST)
      .lean(),
  ]);

  const orgIds = [
    ...new Set(
      [
        ...attention.map((c) => c.orgId),
        ...failedSyncs.map((r) => r.orgId),
        ...failedEvents.map((e) => e.orgId),
      ].map(String),
    ),
  ].map((id) => new Types.ObjectId(id));
  const orgs = await mongoose.connection
    .collection("organization")
    .find({ _id: { $in: orgIds } }, { projection: { name: 1 } })
    .toArray();
  const orgName = new Map(orgs.map((o) => [String(o._id), String(o.name)]));
  const conns = await ConnectionModel.find(
    { _id: { $in: failedSyncs.map((r) => r.connectionId) } },
    { name: 1 },
  ).lean();
  const connName = new Map(conns.map((c) => [c._id.toHexString(), c.name]));

  return {
    generatedAt: now.toISOString(),
    attention: attention.map((c) => ({
      id: c._id.toHexString(),
      name: c.name,
      status: c.status,
      statusReason: c.statusReason ?? null,
      orgId: c.orgId.toHexString(),
      orgName: orgName.get(c.orgId.toHexString()) ?? "Unknown workspace",
      updatedAt: c.updatedAt.toISOString(),
      lastEventAt: iso(c.lastEventAt),
    })),
    failedSyncs: failedSyncs.map((r) => ({
      id: r._id.toHexString(),
      connectionName: connName.get(r.connectionId.toHexString()) ?? "Removed connection",
      orgId: r.orgId.toHexString(),
      orgName: orgName.get(r.orgId.toHexString()) ?? "Unknown workspace",
      stage: r.stage ?? null,
      error: r.error ?? null,
      startedAt: r.startedAt.toISOString(),
    })),
    ingest: {
      eventsLastHour,
      eventsLast24h,
      failedLast24h,
      backlog,
      avgProcessingMs: timing[0] ? Math.round(timing[0].avg) : null,
      maxProcessingMs: timing[0] ? Math.round(timing[0].max) : null,
    },
    failedEvents: failedEvents.map((e) => ({
      id: e._id.toHexString(),
      type: e.type,
      orgId: e.orgId.toHexString(),
      orgName: orgName.get(e.orgId.toHexString()) ?? "Unknown workspace",
      error: String(e.processingError).slice(0, 240),
      receivedAt: e.createdAt.toISOString(),
    })),
    inngestDev: env.INNGEST_DEV,
    inngestUrl: env.INNGEST_DEV ? "http://localhost:8288" : "https://app.inngest.com",
  };
}
