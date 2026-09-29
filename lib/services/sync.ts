import "server-only";

import { Types } from "mongoose";

import { connectDb } from "@/lib/db/connect";
import { ConnectionModel } from "@/lib/db/models/connections";
import { SyncRunModel } from "@/lib/db/models/sync-run";

/**
 * Stub for `sync-connection` (TRD §2.2 step 4). Records a `sync_runs` document for the connection
 * and finishes it immediately.
 * TODO(phase 3): page each resource (domains -> API keys -> segments/topics/properties ->
 * templates -> contacts -> broadcasts -> automations -> sent -> received) with a cursor
 * checkpointed in `sync_runs.resources`, resume a `running` run, skip tombstoned emails and
 * anything older than the retention window, set `connections.lastSyncAt`, compute the checklist.
 * Every Resend call there goes through the adapter and the per-connection throttle.
 */
export async function runSyncStub(input: {
  connectionId: string;
  trigger: "initial" | "scheduled" | "manual";
}): Promise<{ runId: string } | null> {
  await connectDb();
  if (!Types.ObjectId.isValid(input.connectionId)) return null;
  const connection = await ConnectionModel.findOne(
    { _id: input.connectionId, deletedAt: null },
    { orgId: 1 },
  ).lean();
  if (!connection) return null;

  const run = await SyncRunModel.create({
    orgId: connection.orgId,
    connectionId: connection._id,
    trigger: input.trigger,
    status: "running",
    resources: [],
    startedAt: new Date(),
  });
  run.status = "completed";
  run.finishedAt = new Date();
  await run.save();
  return { runId: run._id.toHexString() };
}
