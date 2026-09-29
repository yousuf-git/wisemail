import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startTestDb } from "./helpers";
import { ctxFor, loadMail, seedOrg, type Mail, type Seed } from "./mail-helpers";

let stop: () => Promise<void>;
let m: Mail;
let plans: typeof import("@/lib/services/plan-changes");
let ent: typeof import("@/lib/billing/entitlements");

beforeAll(async () => {
  ({ stop } = await startTestDb("plan-changes"));
  m = await loadMail();
  plans = await import("@/lib/services/plan-changes");
  ent = await import("@/lib/billing/entitlements");
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

const DAY = 86_400_000;

/** An org on Team (the seed helper only knows Free and Pro). */
async function seedTeam() {
  const seed = await seedOrg(m, { plan: "pro" });
  await m.models.OrgSettingsModel.updateOne(
    { orgId: seed.orgId },
    { plan: "team", planState: "active" },
  );
  return seed;
}
const settings = (orgId: Types.ObjectId) => m.models.OrgSettingsModel.findOne({ orgId }).lean();
const owner = (seed: Seed) => ctxFor(m, seed.orgId, "owner");

/** The seeded connection plus `extra` more (oldest first by id). */
async function addConnections(seed: Seed, extra: number) {
  const ids = [seed.connectionId];
  for (let i = 0; i < extra; i++) {
    const _id = new Types.ObjectId();
    await m.models.ConnectionModel.create({
      _id,
      orgId: seed.orgId,
      name: `extra-${_id}`,
      resendTeamFingerprint: `fp-${_id}`,
      createdBy: new Types.ObjectId(),
      status: "active",
      webhook: {
        resendId: `wh_${_id}`,
        signingSecret: m.envelope.encryptSecret("s", { aad: m.hook.secretAad(_id) }),
        events: [],
        registeredAt: new Date(),
      },
    });
    ids.push(_id);
  }
  return ids;
}
const statuses = async (ids: Types.ObjectId[]) =>
  (
    await m.models.ConnectionModel.find({ _id: { $in: ids } })
      .sort({ _id: 1 })
      .lean()
  ).map((c) => c.status);

async function addPeople(seed: Seed) {
  const { default: mongoose } = await import("mongoose");
  const slug = `pc-${seed.team}`;
  await mongoose.connection
    .collection("organization")
    .insertOne({ _id: seed.orgId, name: slug, slug });
  const out: Record<string, Types.ObjectId> = {};
  for (const role of ["owner", "admin"] as const) {
    const userId = new Types.ObjectId();
    out[role] = userId;
    await mongoose.connection
      .collection("user")
      .insertOne({ _id: userId, name: role, email: `${role}-${slug}@x.test`, emailVerified: true });
    await mongoose.connection
      .collection("member")
      .insertOne({ _id: new Types.ObjectId(), organizationId: seed.orgId, userId, role });
  }
  return out;
}

describe("Pro trial", () => {
  it("starts once, gives Pro with capped AI, and needs the Owner", async () => {
    const seed = await seedOrg(m, { plan: "free" });
    await expect(plans.startTrial(ctxFor(m, seed.orgId, "admin"))).rejects.toMatchObject({
      code: "forbidden",
    });
    await plans.startTrial(owner(seed));
    const s = await settings(seed.orgId);
    expect(s).toMatchObject({ plan: "pro", planState: "trialing" });
    expect(s!.trial!.endsAt!.getTime() - s!.trial!.startedAt!.getTime()).toBe(14 * DAY);

    const e = await ent.getEntitlements(seed.orgId);
    expect(e.trial).toMatchObject({ active: true, daysLeft: 14 });
    expect(e.limits).toMatchObject({ connections: 3, aiCreditsPerMonth: 200 });
    expect(e.features.digests).toBe(true);

    await expect(plans.startTrial(owner(seed))).rejects.toMatchObject({ code: "conflict" });
    const audit = await m.models.AuditLogModel.find({
      orgId: seed.orgId,
      action: "plan.trial_started",
    });
    expect(audit).toHaveLength(1);
    expect((await plans.getBillingOverview(owner(seed))).trialAvailable).toBe(false);
  });

  it("is not offered to a paid org or one that already had a trial", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    await expect(plans.startTrial(owner(seed))).rejects.toMatchObject({ code: "conflict" });
  });

  it("ends without a plan: back to Free, extra connections read-only, retention notice", async () => {
    const seed = await seedOrg(m, { plan: "free" });
    const conns = await addConnections(seed, 2);
    await plans.startTrial(owner(seed));
    const now = new Date(Date.now() + 15 * DAY);

    const res = await plans.endExpiredTrials(now);
    expect(res.ended).toBeGreaterThanOrEqual(1);
    const s = await settings(seed.orgId);
    expect(s).toMatchObject({ plan: "free", planState: "free" });
    expect(s!.trial).toBeTruthy(); // kept: the trial is once per org
    expect(await statuses(conns)).toEqual(["active", "read_only", "read_only"]);
    const frozen = await m.models.ConnectionModel.findById(conns[1]).lean();
    expect(frozen!.statusReason).toBe("plan_limit");
    expect(s!.pendingChange).toMatchObject({ toPlan: "free" });
    expect(s!.pendingChange!.retentionEffectiveAt!.getTime() - now.getTime()).toBe(14 * DAY);
    const audit = await m.models.AuditLogModel.findOne({
      orgId: seed.orgId,
      action: "plan.changed",
    });
    expect(audit!.actorType).toBe("system");
    expect(audit!.changes!.after).toMatchObject({ plan: "free", reason: "trial_ended" });

    // A second run does nothing.
    expect((await plans.endExpiredTrials(now)).ended).toBe(0);
    expect(
      await m.models.AuditLogModel.countDocuments({ orgId: seed.orgId, action: "plan.changed" }),
    ).toBe(1);
  });

  it("warns the Owner before the trial ends, once per band", async () => {
    const seed = await seedOrg(m, { plan: "free" });
    const people = await addPeople(seed);
    await plans.startTrial(owner(seed));
    const soon = new Date(Date.now() + 12 * DAY); // 2 days left
    expect((await plans.notifyTrialEnding(soon)).sent).toBe(1);
    expect((await plans.notifyTrialEnding(soon)).sent).toBe(0);
    const rows = await m.models.NotificationModel.find({ orgId: seed.orgId, type: "trial_ending" });
    expect(rows.map((r) => String(r.userId))).toEqual([String(people.owner)]);
    expect(rows[0]!.title).toContain("2 days");
    // The last day is a second, separate notification.
    expect((await plans.notifyTrialEnding(new Date(Date.now() + 13.5 * DAY))).sent).toBe(1);
  });
});

describe("switching plans (beta)", () => {
  it("upgrades at once, updates the meter allowance and brings frozen connections back", async () => {
    const seed = await seedTeam();
    const conns = await addConnections(seed, 2);
    await plans.changePlan(owner(seed), "free").then((r) => expect(r.status).toBe("scheduled"));
    await plans.applyDuePlanChanges(new Date(Date.now() + 40 * DAY));
    expect(await statuses(conns)).toEqual(["active", "read_only", "read_only"]);

    const up = await plans.changePlan(owner(seed), "pro");
    expect(up.status).toBe("applied");
    expect(await statuses(conns)).toEqual(["active", "active", "active"]);
    const revived = await m.models.ConnectionModel.findById(conns[2]).lean();
    expect(revived!.statusReason ?? null).toBeNull();
    expect(await settings(seed.orgId)).toMatchObject({
      plan: "pro",
      planState: "active",
      pendingChange: null,
    });
    expect((await ent.getEntitlements(seed.orgId)).limits.emailsTrackedPerMonth).toBe(75_000);
  });

  it("only revives connections that plan limits froze, up to the new limit", async () => {
    const seed = await seedTeam();
    const conns = await addConnections(seed, 3);
    await m.models.ConnectionModel.updateOne(
      { _id: conns[1] },
      { status: "read_only", statusReason: "key_revoked" },
    );
    await plans.changePlan(owner(seed), "free");
    await plans.applyDuePlanChanges(new Date(Date.now() + 40 * DAY));
    expect(await statuses(conns)).toEqual(["active", "read_only", "read_only", "read_only"]);
    await plans.changePlan(owner(seed), "pro"); // 3 connections included
    expect(await statuses(conns)).toEqual(["active", "read_only", "active", "read_only"]);
    expect((await m.models.ConnectionModel.findById(conns[1]).lean())!.statusReason).toBe(
      "key_revoked",
    );
  });

  it("schedules a downgrade for period end, previews the effects and keeps the plan meanwhile", async () => {
    const seed = await seedTeam();
    const conns = await addConnections(seed, 2);
    const preview = await plans.previewPlanChange(owner(seed), "free");
    expect(preview).toMatchObject({
      direction: "downgrade",
      readOnlyConnections: expect.arrayContaining([expect.stringContaining("extra-")]),
      retention: { from: 365, to: 30 },
    });
    expect(preview.readOnlyConnections).toHaveLength(2);
    expect(preview.lostFeatures).toEqual(
      expect.arrayContaining(["Project-scoped members", "Audit log", "Daily digests"]),
    );

    const res = await plans.changePlan(owner(seed), "free");
    expect(res.status).toBe("scheduled");
    const s = await settings(seed.orgId);
    expect(s!.plan).toBe("team");
    expect(s!.pendingChange!.toPlan).toBe("free");
    expect(s!.pendingChange!.effectiveAt!.getTime()).toBe(s!.billingPeriod.end.getTime());
    expect(s!.pendingChange!.retentionEffectiveAt!.getTime()).toBe(
      s!.billingPeriod.end.getTime() + 14 * DAY,
    );
    expect(await statuses(conns)).toEqual(["active", "active", "active"]);
    expect((await ent.getEntitlements(seed.orgId)).pendingChange?.toPlan).toBe("free");
    expect(await plans.applyDuePlanChanges(new Date())).toMatchObject({ applied: 0 });
  });

  it("applies the downgrade at period end: excess connections read-only, retention notice, then cleared", async () => {
    const seed = await seedTeam();
    const conns = await addConnections(seed, 2);
    await plans.changePlan(owner(seed), "free");
    const end = (await settings(seed.orgId))!.billingPeriod.end;

    const at = new Date(end.getTime() + 1000);
    expect((await plans.applyDuePlanChanges(at)).applied).toBeGreaterThanOrEqual(1);
    const s = await settings(seed.orgId);
    expect(s).toMatchObject({ plan: "free", planState: "free" });
    expect(await statuses(conns)).toEqual(["active", "read_only", "read_only"]);
    // The retention notice survives until the 14 days pass.
    expect(s!.pendingChange).toMatchObject({ toPlan: "free" });
    expect(s!.pendingChange!.retentionEffectiveAt!.getTime()).toBe(at.getTime() + 14 * DAY);
    await plans.applyDuePlanChanges(new Date(at.getTime() + DAY));
    expect((await settings(seed.orgId))!.pendingChange).toBeTruthy();
    expect(
      (await plans.applyDuePlanChanges(new Date(at.getTime() + 15 * DAY))).cleared,
    ).toBeGreaterThanOrEqual(1);
    expect((await settings(seed.orgId))!.pendingChange).toBeNull();
    // Nothing was deleted.
    expect(
      await m.models.ConnectionModel.countDocuments({ orgId: seed.orgId, deletedAt: null }),
    ).toBe(3);
    // Free limits now block a new connection: the count includes read-only ones.
    const e = await ent.getEntitlements(seed.orgId);
    expect(() => ent.assertLimitFor(e, "connections", 3)).toThrow(/Upgrade to Pro/);
  });

  it("lets the Owner cancel a scheduled downgrade (also by choosing the current plan)", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    await plans.changePlan(owner(seed), "free");
    expect((await settings(seed.orgId))!.pendingChange).toBeTruthy();
    expect(await plans.changePlan(owner(seed), "pro")).toMatchObject({
      status: "cancelled_pending",
    });
    expect((await settings(seed.orgId))!.pendingChange).toBeNull();
    await expect(plans.changePlan(owner(seed), "pro")).rejects.toMatchObject({
      code: "validation",
    });
    expect(
      await m.models.AuditLogModel.countDocuments({
        orgId: seed.orgId,
        action: "plan.downgrade_cancelled",
      }),
    ).toBe(1);
  });

  it("ends a trial immediately when the Owner picks Free, and converts it when they pick Pro", async () => {
    const a = await seedOrg(m, { plan: "free" });
    await plans.startTrial(owner(a));
    expect((await plans.changePlan(owner(a), "free")).status).toBe("applied");
    expect(await settings(a.orgId)).toMatchObject({ plan: "free", planState: "free" });

    const b = await seedOrg(m, { plan: "free" });
    await plans.startTrial(owner(b));
    expect((await plans.changePlan(owner(b), "pro")).status).toBe("applied");
    const s = await settings(b.orgId);
    expect(s).toMatchObject({ plan: "pro", planState: "active" });
    expect((await ent.getEntitlements(b.orgId)).limits.aiCreditsPerMonth).toBe(1_000);
  });

  it("is Owner-only and validates the plan", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    for (const role of ["admin", "developer", "viewer"] as const) {
      await expect(plans.changePlan(ctxFor(m, seed.orgId, role), "team")).rejects.toMatchObject({
        code: "forbidden",
      });
    }
    await expect(plans.changePlan(owner(seed), "platinum")).rejects.toMatchObject({
      code: "validation",
    });
    expect((await settings(seed.orgId))!.plan).toBe("pro");
  });

  it("scopes plan changes to the caller's org", async () => {
    const a = await seedOrg(m, { plan: "free" });
    const b = await seedOrg(m, { plan: "free" });
    await plans.changePlan(owner(a), "team");
    expect((await settings(a.orgId))!.plan).toBe("team");
    expect((await settings(b.orgId))!.plan).toBe("free");
  });
});
