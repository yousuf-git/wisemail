import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startTestDb } from "./helpers";

let stop: () => Promise<void>;
let connect: typeof import("@/lib/db/connect");
let models: typeof import("@/lib/db/models");

beforeAll(async () => {
  ({ stop } = await startTestDb("jobs"));
  connect = await import("@/lib/db/connect");
  models = await import("@/lib/db/models");
  await connect.connectDb();
}, 120_000);

afterAll(async () => {
  await connect?.disconnectDb();
  await stop?.();
});

describe("job stubs", () => {
  it("sync stub records a finished sync_runs document for a live connection only", async () => {
    const { runSyncStub } = await import("@/lib/services/sync");
    const orgId = new Types.ObjectId();
    const live = await models.ConnectionModel.create({
      orgId,
      name: "c",
      resendTeamFingerprint: "fp",
      createdBy: new Types.ObjectId(),
      status: "active",
    });
    const result = await runSyncStub({ connectionId: live._id.toHexString(), trigger: "initial" });
    expect(result).not.toBeNull();
    const run = await models.SyncRunModel.findById(result!.runId).lean();
    expect(run).toMatchObject({ trigger: "initial", status: "completed", resources: [] });
    expect(run!.orgId.equals(orgId)).toBe(true);
    expect(run!.finishedAt).toBeInstanceOf(Date);

    expect(
      await runSyncStub({ connectionId: new Types.ObjectId().toHexString(), trigger: "manual" }),
    ).toBeNull();
    expect(await runSyncStub({ connectionId: "junk", trigger: "manual" })).toBeNull();
  });

  it("sync-connection is throttled and serialized per connection (TRD §2.3)", async () => {
    const { syncConnection } = await import("@/inngest/functions/sync-connection");
    const opts = (syncConnection as unknown as { opts: Record<string, unknown> }).opts;
    expect(opts.throttle).toEqual({ key: "event.data.connectionId", limit: 8, period: "1s" });
    expect(opts.concurrency).toEqual({ key: "event.data.connectionId", limit: 1 });
  });
});
