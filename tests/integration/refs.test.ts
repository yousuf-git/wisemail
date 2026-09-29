import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startTestDb } from "./helpers";

let stop: () => Promise<void>;
let mods: {
  connect: typeof import("@/lib/db/connect");
  refs: typeof import("@/lib/db/refs");
  models: typeof import("@/lib/db/models");
  tx: typeof import("@/lib/db/transaction");
};

beforeAll(async () => {
  ({ stop } = await startTestDb("refs"));
  mods = {
    connect: await import("@/lib/db/connect"),
    refs: await import("@/lib/db/refs"),
    models: await import("@/lib/db/models"),
    tx: await import("@/lib/db/transaction"),
  };
  await mods.connect.connectDb();
}, 120_000);

afterAll(async () => {
  await mods?.connect.disconnectDb();
  await stop?.();
});

const audit = (orgId: Types.ObjectId) => ({
  orgId,
  actorType: "system" as const,
  action: "test.created",
  target: { type: "thing", id: "x" },
});

describe("assertRefs", () => {
  it("accepts same-org references and skips nullish ids", async () => {
    const orgA = new Types.ObjectId();
    const log = await mods.models.AuditLogModel.create(audit(orgA));
    await expect(
      mods.refs.assertRefs(orgA, [
        { model: mods.models.AuditLogModel, ids: [log._id, null, undefined] },
      ]),
    ).resolves.toBeUndefined();
  });

  it("rejects a reference that lives in another org, and a missing one", async () => {
    const orgA = new Types.ObjectId();
    const orgB = new Types.ObjectId();
    const inB = await mods.models.AuditLogModel.create(audit(orgB));

    const cross = mods.refs.assertRefs(orgA, [
      { model: mods.models.AuditLogModel, ids: [inB._id] },
    ]);
    await expect(cross).rejects.toBeInstanceOf(mods.refs.RefError);
    await expect(cross).rejects.toMatchObject({ code: "invalid_reference" });

    await expect(
      mods.refs.assertRefs(orgA, [
        { model: mods.models.AuditLogModel, ids: [new Types.ObjectId()] },
      ]),
    ).rejects.toBeInstanceOf(mods.refs.RefError);
  });
});

describe("withTransaction", () => {
  it("commits on success and rolls back on error", async () => {
    const orgId = new Types.ObjectId();
    await mods.tx.withTransaction(async (session) => {
      await mods.models.AuditLogModel.create([audit(orgId)], { session });
    });
    expect(await mods.models.AuditLogModel.countDocuments({ orgId })).toBe(1);

    const orgId2 = new Types.ObjectId();
    await expect(
      mods.tx.withTransaction(async (session) => {
        await mods.models.AuditLogModel.create([audit(orgId2)], { session });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await mods.models.AuditLogModel.countDocuments({ orgId: orgId2 })).toBe(0);
  });
});

describe("models", () => {
  it("orgId is immutable and org_settings is unique per org", async () => {
    const orgId = new Types.ObjectId();
    const s = await mods.models.OrgSettingsModel.create({ orgId });
    expect(s.plan).toBe("free");
    expect(s.planState).toBe("free");
    expect(s.timezone).toBe("UTC");
    expect(s.ai?.enabled).toBe(false);

    await mods.models.OrgSettingsModel.syncIndexes();
    await mods.models.OrgSettingsModel.updateOne({ _id: s._id }, { orgId: new Types.ObjectId() });
    expect((await mods.models.OrgSettingsModel.findById(s._id).lean())!.orgId.equals(orgId)).toBe(
      true,
    );

    await expect(mods.models.OrgSettingsModel.create({ orgId })).rejects.toThrow(/duplicate key/);
  });

  it("realtime_events has a 1h TTL index and no updatedAt", async () => {
    await mods.models.RealtimeEventModel.syncIndexes();
    const indexes = await mods.models.RealtimeEventModel.collection.indexes();
    expect(indexes.find((i) => i.key.createdAt === 1)?.expireAfterSeconds).toBe(3600);
    expect(indexes.some((i) => i.key.orgId === 1 && i.key._id === 1)).toBe(true);
    const e = await mods.models.RealtimeEventModel.create({
      orgId: new Types.ObjectId(),
      topics: ["threads"],
    });
    expect(e.toObject()).not.toHaveProperty("updatedAt");
  });
});
