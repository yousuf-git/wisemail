import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startTestDb } from "./helpers";
import { ctxFor, loadMail, seedOrg, type Mail } from "./mail-helpers";

let stop: () => Promise<void>;
let m: Mail;
let progress: typeof import("@/lib/tours/progress");

beforeAll(async () => {
  ({ stop } = await startTestDb("tours"));
  m = await loadMail();
  progress = await import("@/lib/tours/progress");
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

const find = (orgId: Types.ObjectId, userId: string) =>
  m.models.TourProgressModel.findOne({
    orgId,
    userId: new Types.ObjectId(userId),
    tourId: "welcome",
  }).lean();

describe("tour progress service", () => {
  it("records start, steps, skip and complete per user and org", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId, "owner");
    expect(await find(seed.orgId, ctx.user.id)).toBeNull();

    await progress.recordTourEvent(ctx, { tourId: "welcome", event: "start" });
    expect(await find(seed.orgId, ctx.user.id)).toMatchObject({
      status: "started",
      lastStep: 0,
      version: "1.0.0",
      trigger: "auto",
    });

    await progress.recordTourEvent(ctx, { tourId: "welcome", event: "step", step: 2 });
    expect((await find(seed.orgId, ctx.user.id))!.lastStep).toBe(2);

    await progress.recordTourEvent(ctx, { tourId: "welcome", event: "skip", step: 3 });
    const skipped = await find(seed.orgId, ctx.user.id);
    expect(skipped).toMatchObject({ status: "skipped", lastStep: 3 });
    expect(skipped!.skippedAt).toBeInstanceOf(Date);

    // A late step event after the skip must not bring it back to "started".
    await progress.recordTourEvent(ctx, { tourId: "welcome", event: "step", step: 4 });
    expect((await find(seed.orgId, ctx.user.id))!.status).toBe("skipped");

    // Restart from the menu (manual), then finish: completed, and the check survives a replay.
    await progress.recordTourEvent(ctx, { tourId: "welcome", event: "start", trigger: "manual" });
    expect(await find(seed.orgId, ctx.user.id)).toMatchObject({
      status: "started",
      trigger: "manual",
      skippedAt: null,
    });
    await progress.recordTourEvent(ctx, { tourId: "welcome", event: "complete", step: 5 });
    const done = await find(seed.orgId, ctx.user.id);
    expect(done).toMatchObject({ status: "completed", lastStep: 5 });
    expect(done!.completedAt).toBeInstanceOf(Date);
    await progress.recordTourEvent(ctx, { tourId: "welcome", event: "start", trigger: "manual" });
    expect((await find(seed.orgId, ctx.user.id))!.completedAt).toBeInstanceOf(Date);

    expect(await m.models.TourProgressModel.countDocuments({ orgId: seed.orgId })).toBe(1);
  });

  it("is per user and per org", async () => {
    const a = await seedOrg(m);
    const b = await seedOrg(m);
    const alice = ctxFor(m, a.orgId, "owner");
    const bob = ctxFor(m, a.orgId, "admin");
    const aliceElsewhere = ctxFor(m, b.orgId, "owner", {
      userId: new Types.ObjectId(alice.user.id),
    });
    await progress.recordTourEvent(alice, { tourId: "welcome", event: "skip" });

    const boot = async (ctx: typeof alice) =>
      (await progress.getTourBootstrap(ctx)).tours.find((t) => t.id === "welcome")!;
    expect((await boot(alice)).status).toBe("skipped");
    expect((await boot(bob)).status).toBeNull();
    expect((await boot(aliceElsewhere)).status).toBeNull();
  });

  it("bootstrap adapts to the member and reports whether the org has a connection", async () => {
    const seed = await seedOrg(m);
    const owner = await progress.getTourBootstrap(ctxFor(m, seed.orgId, "owner"));
    expect(owner.hasConnection).toBe(true);
    expect(owner.tours[0]!.stepIds).toEqual([
      "hello",
      "nav",
      "connect",
      "connections",
      "inbox",
      "compose",
    ]);
    const viewer = await progress.getTourBootstrap(ctxFor(m, seed.orgId, "viewer"));
    expect(viewer.tours[0]!.stepIds).toEqual(["hello", "nav", "inbox"]);
    const empty = await seedOrg(m);
    await m.models.ConnectionModel.updateMany(
      { orgId: empty.orgId },
      { $set: { deletedAt: new Date() } },
    );
    expect((await progress.getTourBootstrap(ctxFor(m, empty.orgId, "owner"))).hasConnection).toBe(
      false,
    );
  });

  it("flags a higher major version as outdated so it can run once more", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId, "owner");
    await progress.recordTourEvent(ctx, { tourId: "welcome", event: "skip" });
    await m.models.TourProgressModel.updateOne(
      { orgId: seed.orgId },
      { $set: { version: "0.9.0" } },
    );
    const state = (await progress.getTourBootstrap(ctx)).tours[0]!;
    expect(state).toMatchObject({ status: "skipped", outdated: true });
  });

  it("rejects unknown tours and bad input", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId, "owner");
    await expect(
      progress.recordTourEvent(ctx, { tourId: "nope", event: "start" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      progress.recordTourEvent(ctx, { tourId: "welcome", event: "bogus" as never }),
    ).rejects.toThrow();
  });

  it("deleteTourProgress removes a member's progress (left the org)", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId, "owner");
    await progress.recordTourEvent(ctx, { tourId: "welcome", event: "start" });
    await progress.deleteTourProgress(seed.orgId, new Types.ObjectId(ctx.user.id));
    expect(await find(seed.orgId, ctx.user.id)).toBeNull();
  });
});
