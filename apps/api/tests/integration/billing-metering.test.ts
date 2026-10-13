import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { startTestDb } from "./helpers";
import { emailData, loadMail, seedOrg, storeEvent, type Mail, type Seed } from "./mail-helpers";

let stop: () => Promise<void>;
let m: Mail;
let metering: typeof import("@/lib/billing/metering");
let thresholds: typeof import("@/lib/billing/thresholds");

beforeAll(async () => {
  ({ stop } = await startTestDb("billing-metering"));
  m = await loadMail();
  metering = await import("@/lib/billing/metering");
  thresholds = await import("@/lib/billing/thresholds");
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

beforeEach(() => {
  m.fake.resetFakeResend();
  m.jobs.resetSentJobs();
});

let n = 0;
const from = (seed: Seed) => `Acme <hello@${seed.domain.name}>`;

/** One outbound email through the real process-event path. */
async function send(
  seed: Seed,
  type = "email.sent",
  extra: Record<string, unknown> = {},
  id?: string,
) {
  const resendId = id ?? `em_meter_${++n}_${Date.now()}`;
  const event = await storeEvent(
    m,
    seed,
    type,
    emailData(resendId, { from: from(seed), ...extra }),
  );
  await m.processing.processWebhookEvent(event);
  return resendId;
}

const period = (orgId: Types.ObjectId) =>
  m.models.UsagePeriodModel.findOne({ orgId }).sort({ periodStart: -1 }).lean();
const total = async (orgId: Types.ObjectId) => {
  const p = await period(orgId);
  return p ? metering.trackedTotal(p.emailsTracked) : 0;
};
const settings = (orgId: Types.ObjectId) => m.models.OrgSettingsModel.findOne({ orgId }).lean();
const setAllowance = (orgId: Types.ObjectId, emailsTrackedPerMonth: number) =>
  m.models.OrgSettingsModel.updateOne({ orgId }, { limitOverrides: { emailsTrackedPerMonth } });

describe("metering: once per tracked email", () => {
  it("counts an email once however many events arrive, and marks it metered", async () => {
    const seed = await seedOrg(m);
    const id = await send(seed, "email.sent");
    await send(seed, "email.delivered", {}, id);
    await send(seed, "email.opened", {}, id);
    await send(seed, "email.clicked", { click: { link: "https://x.test" } }, id);

    const p = await period(seed.orgId);
    expect(p!.emailsTracked).toMatchObject({ transactional: 1, broadcast: 0, inbound: 0 });
    expect(p!.plan).toBe("pro");
    expect(p!.allowance).toBe(75_000);
    const day = new Date().toISOString().slice(0, 10);
    expect((p!.daily as Record<string, { transactional: number }>)[day]!.transactional).toBe(1);
    const email = await m.models.EmailModel.findOne({ resendId: id });
    expect(email!.meteredAt).toBeInstanceOf(Date);
  });

  it("is idempotent when the same event is processed again and when events race", async () => {
    const seed = await seedOrg(m);
    const resendId = `em_race_${Date.now()}`;
    const ids = await Promise.all(
      ["email.sent", "email.delivered", "email.opened"].map((type) =>
        storeEvent(m, seed, type, emailData(resendId, { from: from(seed) })),
      ),
    );
    await Promise.all(ids.map((id) => m.processing.processWebhookEvent(id)));
    await Promise.all(ids.map((id) => m.processing.processWebhookEvent(id)));
    expect(await total(seed.orgId)).toBe(1);
  });

  it("counts distinct emails exactly under concurrency", async () => {
    const seed = await seedOrg(m);
    await Promise.all(Array.from({ length: 12 }, () => send(seed)));
    const p = await period(seed.orgId);
    expect(p!.emailsTracked!.transactional).toBe(12);
    const day = new Date().toISOString().slice(0, 10);
    expect((p!.daily as Record<string, { transactional: number }>)[day]!.transactional).toBe(12);
    expect(await m.models.UsagePeriodModel.countDocuments({ orgId: seed.orgId })).toBe(1);
  });

  it("splits the three streams: transactional, broadcast recipients and inbound", async () => {
    const seed = await seedOrg(m);
    await send(seed);
    await send(seed, "email.sent", { broadcast_id: "brd_1" });
    await send(seed, "email.sent", { broadcast_id: "brd_1" });
    const inbound = m.fake.createFakeReceivedEmail(seed.key, {
      from: "Jane <jane@customer.test>",
      to: [seed.mailbox],
      subject: "Help",
      text: "x",
    });
    await m.processing.processWebhookEvent(
      await storeEvent(m, seed, "email.received", inbound.event as never),
    );
    const p = await period(seed.orgId);
    expect(p!.emailsTracked).toMatchObject({ transactional: 1, broadcast: 2, inbound: 1 });
  });

  it("does not count another org's emails", async () => {
    const a = await seedOrg(m);
    const b = await seedOrg(m);
    await send(a);
    await send(a);
    await send(b);
    expect(await total(a.orgId)).toBe(2);
    expect(await total(b.orgId)).toBe(1);
  });

  it("rolls a stale billing period into the current month and restarts grace", async () => {
    const seed = await seedOrg(m, { plan: "free" });
    const old = { start: new Date(Date.UTC(2026, 0, 1)), end: new Date(Date.UTC(2026, 1, 1)) };
    await m.models.OrgSettingsModel.updateOne(
      { orgId: seed.orgId },
      { billingPeriod: old, "grace.overAllowanceSince": new Date(Date.UTC(2026, 0, 20)) },
    );
    await send(seed);
    const s = await settings(seed.orgId);
    expect(s!.billingPeriod.start.getTime()).toBeGreaterThan(old.end.getTime() - 1);
    expect(s!.grace?.overAllowanceSince ?? null).toBeNull();
    expect(await total(seed.orgId)).toBe(1);
  });
});

describe("over the allowance", () => {
  it("Free: keeps ingesting, starts a 7-day grace, then gives excess emails 7-day retention", async () => {
    const seed = await seedOrg(m, { plan: "free" });
    await setAllowance(seed.orgId, 2);
    const ids = [await send(seed), await send(seed)];
    expect((await settings(seed.orgId))!.grace?.overAllowanceSince ?? null).toBeNull();

    // Third email: over the allowance, grace starts, retention stays at 30 days.
    const third = await send(seed);
    ids.push(third);
    expect(await total(seed.orgId)).toBe(3);
    const since = (await settings(seed.orgId))!.grace!.overAllowanceSince!;
    expect(since).toBeInstanceOf(Date);
    const inGrace = await m.models.EmailModel.findOne({ resendId: third });
    expect(inGrace!.overAllowance).toBe(false);
    expect(inGrace!.expireAt!.getTime()).toBeGreaterThan(Date.now() + 20 * 86_400_000);

    // Grace over (8 days ago): the next excess email is stored with 7 days of history.
    await m.models.OrgSettingsModel.updateOne(
      { orgId: seed.orgId },
      { "grace.overAllowanceSince": new Date(Date.now() - 8 * 86_400_000) },
    );
    const late = await send(seed);
    const short = await m.models.EmailModel.findOne({ resendId: late });
    expect(short!.overAllowance).toBe(true);
    const days = (short!.expireAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    // Never dropped: every email is stored and counted, earlier ones keep their retention.
    expect(await total(seed.orgId)).toBe(4);
    expect((await period(seed.orgId))!.overage!.emails).toBe(2);
    expect(await m.models.EmailModel.countDocuments({ resendId: { $in: [...ids, late] } })).toBe(4);
    expect(
      (await m.models.EmailModel.findOne({ resendId: ids[0] }))!.expireAt!.getTime(),
    ).toBeGreaterThan(Date.now() + 20 * 86_400_000);
  });

  it("paid plan: counts overage without grace or shortened retention", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    await setAllowance(seed.orgId, 1);
    await send(seed);
    const over = await send(seed);
    await send(seed);
    expect((await period(seed.orgId))!.overage!.emails).toBe(2);
    expect((await settings(seed.orgId))!.grace?.overAllowanceSince ?? null).toBeNull();
    const email = await m.models.EmailModel.findOne({ resendId: over });
    expect(email!.overAllowance).toBe(false);
    expect(email!.expireAt!.getTime()).toBeGreaterThan(Date.now() + 100 * 86_400_000);
  });
});

describe("usage-thresholds job", () => {
  async function orgWithPeople(seed: Seed) {
    const slug = `thr-${seed.team}`;
    await m.models.OrgSettingsModel.updateOne(
      { orgId: seed.orgId },
      { limitOverrides: { emailsTrackedPerMonth: 10 } },
    );
    const { default: mongoose } = await import("mongoose");
    await mongoose.connection
      .collection("organization")
      .insertOne({ _id: seed.orgId, name: slug, slug });
    const people: Record<string, Types.ObjectId> = {};
    for (const role of ["owner", "admin", "viewer"] as const) {
      const userId = new Types.ObjectId();
      people[role] = userId;
      await mongoose.connection.collection("user").insertOne({
        _id: userId,
        name: role,
        email: `${role}-${slug}@x.test`,
        emailVerified: true,
      });
      await mongoose.connection
        .collection("member")
        .insertOne({ _id: new Types.ObjectId(), organizationId: seed.orgId, userId, role });
    }
    return people;
  }
  const notes = (orgId: Types.ObjectId) =>
    m.models.NotificationModel.find({ orgId, type: "usage_threshold" }).lean();

  it("notifies Owners and Admins once at 80% and once at 100%", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const people = await orgWithPeople(seed);
    for (let i = 0; i < 7; i++) await send(seed);

    expect(await thresholds.runUsageThresholds()).toMatchObject({ notified: 0 });
    await send(seed); // 8 of 10
    const first = await thresholds.runUsageThresholds();
    expect(first.notified).toBe(2);
    expect((await thresholds.runUsageThresholds()).notified).toBe(0);
    let rows = await notes(seed.orgId);
    expect(rows.map((r) => String(r.userId)).sort()).toEqual(
      [String(people.owner), String(people.admin)].sort(),
    );
    expect(rows[0]!.title).toContain("80%");
    expect(rows[0]!.link).toBe(`/thr-${seed.team}/settings/usage`);

    await send(seed);
    await send(seed); // 10 of 10
    expect((await thresholds.runUsageThresholds()).notified).toBe(2);
    rows = await notes(seed.orgId);
    expect(rows).toHaveLength(4);
    expect((await period(seed.orgId))!.thresholdsNotified).toEqual([80, 100]);
    expect((await thresholds.runUsageThresholds()).notified).toBe(0);
  });

  it("starts the Free grace period if metering missed it, without touching paid orgs", async () => {
    const free = await seedOrg(m, { plan: "free" });
    const paid = await seedOrg(m, { plan: "pro" });
    for (const s of [free, paid]) {
      await m.models.OrgSettingsModel.updateOne(
        { orgId: s.orgId },
        { limitOverrides: { emailsTrackedPerMonth: 1 } },
      );
      await send(s);
      await send(s);
    }
    await m.models.OrgSettingsModel.updateOne(
      { orgId: free.orgId },
      { $unset: { "grace.overAllowanceSince": "" } },
    );
    await thresholds.runUsageThresholds();
    expect((await settings(free.orgId))!.grace?.overAllowanceSince).toBeInstanceOf(Date);
    expect((await settings(paid.orgId))!.grace?.overAllowanceSince ?? null).toBeNull();
  });
});

describe("usage overview and sidebar tile", () => {
  it("reports real counts, the split, a projection and resource meters", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    await send(seed);
    await send(seed);
    await send(seed, "email.sent", { broadcast_id: "brd_9" });
    const { ctxFor } = await import("./mail-helpers");
    const usage = await import("@/lib/services/usage");
    const ctx = ctxFor(m, seed.orgId, "owner");

    const o = await usage.getUsageOverview(ctx);
    expect(o.plan).toEqual({ id: "pro", label: "Pro" });
    expect(o.tracked).toEqual({ transactional: 2, broadcast: 1, inbound: 0, total: 3 });
    expect(o.allowance).toBe(75_000);
    expect(o.daily).toHaveLength(o.period.daysTotal);
    expect(o.daily.reduce((n, d) => n + d.transactional + d.broadcast, 0)).toBe(3);
    expect(o.projection.monthEnd).toBeGreaterThanOrEqual(3);
    expect(o.projection.over).toBe(0);
    expect(o.resources.find((r) => r.key === "connections")).toMatchObject({ used: 1, limit: 3 });
    expect(o.ai).toMatchObject({ enabled: true, allowance: 1_000 });
    expect(o.history).toEqual([]);

    const tile = await usage.getUsageSummary(ctx);
    expect(tile.used).toEqual({ transactional: 2, broadcast: 1, inbound: 0 });
    expect(tile.allowance).toBe(75_000);
    expect(tile.banner).toBeNull();
    expect(tile.aiCredits).toBe(1_000);

    await expect(usage.getUsageOverview(ctxFor(m, seed.orgId, "viewer"))).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("projects overage cost on paid plans and raises a banner over the allowance", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    await setAllowance(seed.orgId, 2);
    for (let i = 0; i < 4; i++) await send(seed);
    const { ctxFor } = await import("./mail-helpers");
    const usage = await import("@/lib/services/usage");
    const ctx = ctxFor(m, seed.orgId, "admin");
    const o = await usage.getUsageOverview(ctx);
    expect(o.overage).toMatchObject({ emails: 2, costUsd: 1, graceEndsAt: null });
    expect(o.projection.overageCostUsd).toBeGreaterThanOrEqual(1);
    const tile = await usage.getUsageSummary(ctx);
    expect(tile.banner).toMatchObject({ kind: "over_allowance", action: { label: "View usage" } });
    expect(tile.overageCostUsd).toBe(1);
  });

  it("shows the Free grace period in the overview", async () => {
    const seed = await seedOrg(m, { plan: "free" });
    await setAllowance(seed.orgId, 1);
    await send(seed);
    await send(seed);
    const { ctxFor } = await import("./mail-helpers");
    const usage = await import("@/lib/services/usage");
    const o = await usage.getUsageOverview(ctxFor(m, seed.orgId, "owner"));
    expect(o.overage.graceEndsAt).toBeTruthy();
    expect(o.overage.graceEnded).toBe(false);
    expect(o.ai.enabled).toBe(false);
  });
});
