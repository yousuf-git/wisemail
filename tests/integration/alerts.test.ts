import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { NotificationType } from "@/lib/notifications/types";
import { startTestDb } from "./helpers";
import { addRollup, hoursAgo, seedTeam } from "./alerts-helpers";
import { ctxFor, loadMail, seedOrg, type Mail, type Seed } from "./mail-helpers";

let stop: () => Promise<void>;
let m: Mail;
let evaluation: typeof import("@/lib/services/alert-evaluation");
let alerts: typeof import("@/lib/services/alerts");
let notifications: typeof import("@/lib/services/notifications");
let outbox: typeof import("@/lib/services/system-email");

beforeAll(async () => {
  ({ stop } = await startTestDb("alerts"));
  m = await loadMail();
  evaluation = await import("@/lib/services/alert-evaluation");
  alerts = await import("@/lib/services/alerts");
  notifications = await import("@/lib/services/notifications");
  outbox = await import("@/lib/services/system-email");
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

beforeEach(() => {
  outbox.clearOutbox();
});

async function setup(options: { plan?: "free" | "pro" } = {}) {
  const seed = await seedOrg(m, options);
  const team = await seedTeam(m, seed);
  const ctx = ctxFor(m, seed.orgId, "owner", { userId: team.people.owner!.userId });
  return { seed, team, ctx };
}

const bounceRule = (over: Record<string, unknown> = {}) => ({
  name: "Bounce rate over 3%",
  kind: "bounce_rate" as const,
  condition: { operator: "gt" as const, threshold: 3, windowMinutes: 60, minVolume: 10 },
  ...over,
});

const incidents = (seed: Seed, filter: Record<string, unknown> = {}) =>
  m.models.AlertIncidentModel.find({ orgId: seed.orgId, ...filter }).sort({ openedAt: 1 });

const notes = (seed: Seed, userId: Types.ObjectId, type?: NotificationType) =>
  m.models.NotificationModel.find({ orgId: seed.orgId, userId, ...(type ? { type } : {}) });

describe("rate rules: threshold, volume and window", () => {
  it("fires only above the threshold, once volume is high enough", async () => {
    const { seed, ctx } = await setup();
    await alerts.createAlertRule(ctx, bounceRule());

    await addRollup(m, seed, { sent: 100, delivered: 96, bounced_hard: 2 });
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 0 });

    await addRollup(m, seed, { bounced_soft: 2 }); // 4 of 100
    const summary = await evaluation.evaluateOrgAlerts(seed.orgId);
    expect(summary).toMatchObject({ rules: 1, opened: 1, resolved: 0 });
    const [incident] = await incidents(seed);
    expect(incident).toMatchObject({ status: "open", active: true, kind: "bounce_rate" });
    expect(incident!.observedValue).toBe(4);
    expect(incident!.title).toBe(`Bounce rate is 4% on ${seed.domain.name}`);
    expect(incident!.summary).toContain("4 of 100 emails bounced");
    expect(incident!.context).toMatchObject({ threshold: 3, volume: 100 });
  });

  it("ignores samples below minVolume", async () => {
    const { seed, ctx } = await setup();
    await alerts.createAlertRule(ctx, bounceRule());
    await addRollup(m, seed, { sent: 5, bounced_hard: 5 }); // 100% but only 5 emails
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 0 });
    await alerts.createAlertRule(
      ctx,
      bounceRule({
        name: "Sensitive",
        condition: { operator: "gt", threshold: 3, windowMinutes: 60, minVolume: 1 },
      }),
    );
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 1 });
  });

  it("only counts hourly buckets inside the window", async () => {
    const { seed, ctx } = await setup();
    await alerts.createAlertRule(ctx, bounceRule());
    // A bad spell three hours ago is outside a 1 hour window (2 hours back is the oldest bucket).
    await addRollup(m, seed, { sent: 100, bounced_hard: 20 }, hoursAgo(3));
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 0 });

    const wide = await alerts.createAlertRule(
      ctx,
      bounceRule({
        name: "Wide",
        condition: { operator: "gt", threshold: 3, windowMinutes: 300, minVolume: 10 },
      }),
    );
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 1 });
    expect((await incidents(seed))[0]!.ruleId.toHexString()).toBe(wide.id);
  });

  it("scopes to a domain", async () => {
    const { seed, ctx } = await setup();
    await alerts
      .createAlertRule(
        ctx,
        bounceRule({ scope: { domainIds: [new Types.ObjectId().toHexString()] } }),
      )
      .catch((e) => expect(e.name).toBe("RefError"));
    await alerts.createAlertRule(
      ctx,
      bounceRule({ name: "Mine", scope: { domainIds: [seed.domain._id.toHexString()] } }),
    );
    await addRollup(m, seed, { sent: 100, bounced_hard: 10 });
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 1 });
  });
});

describe("incidents: dedupe and resolve", () => {
  it("opens one incident however often it runs, and notifies once", async () => {
    const { seed, team, ctx } = await setup();
    await alerts.createAlertRule(ctx, bounceRule());
    await addRollup(m, seed, { sent: 100, bounced_hard: 10 });

    const first = await evaluation.evaluateOrgAlerts(seed.orgId);
    const second = await evaluation.evaluateOrgAlerts(seed.orgId);
    const third = await Promise.all([
      evaluation.evaluateOrgAlerts(seed.orgId),
      evaluation.evaluateOrgAlerts(seed.orgId),
    ]);
    expect(first.opened).toBe(1);
    expect(second).toMatchObject({ opened: 0, refreshed: 1 });
    expect(third.reduce((n, s) => n + s.opened, 0)).toBe(0);
    expect(await incidents(seed)).toHaveLength(1);
    expect(await notes(seed, team.people.owner!.userId, "incident_opened")).toHaveLength(1);
  });

  it("resolves when the condition clears, and opens a fresh incident if it returns", async () => {
    const { seed, team, ctx } = await setup();
    await alerts.createAlertRule(ctx, bounceRule());
    const spike = new Date();
    await addRollup(m, seed, { sent: 100, bounced_hard: 10 }, spike);
    await evaluation.evaluateOrgAlerts(seed.orgId, { now: spike });
    expect((await incidents(seed))[0]!.active).toBe(true);

    // Two hours on, the spike's bucket is outside the 1 hour window.
    const later = new Date(spike.getTime() + 2 * 3_600_000);
    expect(await evaluation.evaluateOrgAlerts(seed.orgId, { now: later })).toMatchObject({
      resolved: 1,
    });
    const [resolved] = await incidents(seed);
    expect(resolved).toMatchObject({ status: "resolved", active: false });
    expect(resolved!.resolvedAt).toEqual(later);
    expect(await notes(seed, team.people.owner!.userId, "incident_resolved")).toHaveLength(1);

    await addRollup(m, seed, { sent: 100, bounced_hard: 10 }, later);
    await evaluation.evaluateOrgAlerts(seed.orgId, { now: later });
    const all = await incidents(seed);
    expect(all).toHaveLength(2);
    expect(all.map((i) => i.active)).toEqual([false, true]);
  });

  it("acknowledged incidents stay open until the condition clears", async () => {
    const { seed, ctx } = await setup();
    await alerts.createAlertRule(ctx, bounceRule());
    await addRollup(m, seed, { sent: 100, bounced_hard: 10 });
    await evaluation.evaluateOrgAlerts(seed.orgId);
    const [incident] = await incidents(seed);
    const acked = await alerts.acknowledgeIncident(ctx, incident!.id);
    expect(acked.status).toBe("acknowledged");
    const again = await evaluation.evaluateOrgAlerts(seed.orgId);
    expect(again).toMatchObject({ opened: 0, refreshed: 1 });
    expect(await incidents(seed)).toHaveLength(1);
  });

  it("closes incidents quietly when their rule is disabled or deleted", async () => {
    const { seed, team, ctx } = await setup();
    const rule = await alerts.createAlertRule(ctx, bounceRule());
    await addRollup(m, seed, { sent: 100, bounced_hard: 10 });
    await evaluation.evaluateOrgAlerts(seed.orgId);
    await alerts.setAlertRuleEnabled(ctx, { id: rule.id, enabled: false });
    await evaluation.evaluateOrgAlerts(seed.orgId);
    expect((await incidents(seed))[0]).toMatchObject({ active: false, status: "resolved" });
    expect(await notes(seed, team.people.owner!.userId, "incident_resolved")).toHaveLength(0);

    await alerts.deleteAlertRule(ctx, rule.id);
    expect(await incidents(seed)).toHaveLength(0);
  });

  it("any-complaint rules fire on the first complaint", async () => {
    const { seed, ctx } = await setup();
    await alerts.createAlertRule(ctx, {
      name: "Any complaint",
      kind: "complaint_any",
      condition: { operator: "gt", threshold: 0, windowMinutes: 60, minVolume: 0 },
    });
    await addRollup(m, seed, { sent: 10, delivered: 10 });
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 0 });
    await addRollup(m, seed, { complained: 1 });
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 1 });
    expect((await incidents(seed))[0]!.title).toContain("1 complaint");
  });
});

describe("silence, domain and connection rules", () => {
  it("flags a connection with no events for the window and resolves on the next event", async () => {
    const { seed, ctx } = await setup();
    await alerts.createAlertRule(ctx, {
      name: "Silence",
      kind: "connection_silent",
      condition: { operator: "gt", threshold: 0, windowMinutes: 24 * 60, minVolume: 0 },
    });
    // A connection that just got connected has had no events yet: not silent.
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 0 });

    await m.models.ConnectionModel.updateOne(
      { _id: seed.connectionId },
      { $set: { lastEventAt: hoursAgo(30) } },
    );
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 1 });
    const [incident] = await incidents(seed);
    expect(incident!.title).toMatch(/silent for 30 hours/);

    await m.models.ConnectionModel.updateOne(
      { _id: seed.connectionId },
      { $set: { lastEventAt: new Date() } },
    );
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ resolved: 1 });
  });

  it("a connection that never reported flags once it is older than the window", async () => {
    const { seed, ctx } = await setup();
    await alerts.createAlertRule(ctx, {
      name: "Silence",
      kind: "connection_silent",
      condition: { operator: "gt", threshold: 0, windowMinutes: 6 * 60, minVolume: 0 },
    });
    await m.models.ConnectionModel.collection.updateOne(
      { _id: seed.connectionId },
      { $set: { createdAt: hoursAgo(10) } },
    );
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 1 });
  });

  it("tracks failed domains and connections that need attention", async () => {
    const { seed, ctx } = await setup();
    await alerts.createAlertRule(ctx, {
      name: "Domain",
      kind: "domain_status",
      condition: { operator: "gt", threshold: 0, windowMinutes: 0, minVolume: 0 },
    });
    await alerts.createAlertRule(ctx, {
      name: "Connection",
      kind: "connection_status",
      condition: { operator: "gt", threshold: 0, windowMinutes: 0, minVolume: 0 },
    });
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 0 });

    await m.models.DomainModel.updateOne({ _id: seed.domain._id }, { $set: { status: "failed" } });
    await m.models.ConnectionModel.updateOne(
      { _id: seed.connectionId },
      { $set: { status: "needs_attention", statusReason: "key_revoked" } },
    );
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 2 });
    const titles = (await incidents(seed)).map((i) => i.title).sort();
    expect(titles[0]).toContain("needs attention");
    expect(titles[1]).toContain(`${seed.domain.name} failed verification`);

    await m.models.DomainModel.updateOne(
      { _id: seed.domain._id },
      { $set: { status: "verified" } },
    );
    await m.models.ConnectionModel.updateOne(
      { _id: seed.connectionId },
      { $set: { status: "active" } },
    );
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ resolved: 2 });
  });
});

describe("rules and plan limits", () => {
  it("enforces the plan's rule limit (Free 3, Pro 20) and never deletes existing rules", async () => {
    const { seed, ctx } = await setup({ plan: "free" });
    for (let i = 0; i < 3; i++)
      await alerts.createAlertRule(ctx, bounceRule({ name: `Rule ${i}` }));
    await expect(alerts.createAlertRule(ctx, bounceRule({ name: "Fourth" }))).rejects.toMatchObject(
      {
        code: "plan_limit_reached",
        message: expect.stringContaining("Upgrade to Pro"),
      },
    );
    expect(await alerts.getAlertQuota(ctx)).toMatchObject({ used: 3, limit: 3, planLabel: "Free" });

    await m.models.OrgSettingsModel.updateOne({ orgId: seed.orgId }, { plan: "pro" });
    await alerts.createAlertRule(ctx, bounceRule({ name: "Fourth" }));
    expect((await alerts.getAlertQuota(ctx)).limit).toBe(20);
    await m.models.OrgSettingsModel.updateOne({ orgId: seed.orgId }, { plan: "team" });
    expect((await alerts.getAlertQuota(ctx)).limit).toBeNull();
  });

  it("checks permissions, validates input and detects concurrent edits", async () => {
    const { seed, ctx } = await setup();
    const viewer = ctxFor(m, seed.orgId, "viewer");
    await expect(alerts.createAlertRule(viewer, bounceRule())).rejects.toMatchObject({
      permission: "alertRule:create",
    });
    await expect(alerts.listAlertRules(viewer)).rejects.toMatchObject({
      permission: "alertRule:read",
    });
    await expect(
      alerts.createAlertRule(
        ctx,
        bounceRule({
          condition: { operator: "gt", threshold: 3, windowMinutes: 10, minVolume: 0 },
        }),
      ),
    ).rejects.toBeTruthy(); // windows are at least an hour

    const rule = await alerts.createAlertRule(ctx, bounceRule());
    const edit = (name: string, version?: number) =>
      alerts.updateAlertRule(ctx, { id: rule.id, version, rule: { ...bounceRule({ name }) } });
    const saved = await edit("Renamed", rule.version);
    expect(saved.name).toBe("Renamed");
    await expect(edit("Stale", rule.version)).rejects.toMatchObject({ code: "conflict" });
  });

  it("keeps rules of other orgs out of reach", async () => {
    const a = await setup();
    const b = await setup();
    const rule = await alerts.createAlertRule(a.ctx, bounceRule());
    expect(await alerts.listAlertRules(b.ctx)).toEqual([]);
    expect(await alerts.getAlertRule(b.ctx, rule.id)).toBeNull();
    await expect(alerts.deleteAlertRule(b.ctx, rule.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("notification fan-out", () => {
  const fire = async (
    ctx: ReturnType<typeof ctxFor>,
    seed: Seed,
    options: { projectId?: Types.ObjectId | null } = {},
  ) => {
    await alerts.createAlertRule(ctx, bounceRule());
    await addRollup(
      m,
      seed,
      { sent: 100, bounced_hard: 10 },
      new Date(),
      options.projectId ?? null,
    );
    await evaluation.evaluateOrgAlerts(seed.orgId);
  };

  it("goes to members who can read alert rules, not to support or viewers", async () => {
    const { seed, team, ctx } = await setup();
    await fire(ctx, seed);
    for (const role of ["owner", "admin", "developer"]) {
      expect(await notes(seed, team.people[role]!.userId, "incident_opened")).toHaveLength(1);
    }
    for (const role of ["support", "viewer"]) {
      expect(await notes(seed, team.people[role]!.userId)).toHaveLength(0);
    }
    const [n] = await notes(seed, team.people.owner!.userId);
    expect(n!.link).toMatch(new RegExp(`^/${team.slug}/alerts/incidents/[0-9a-f]{24}$`));
  });

  it("hides project-less incidents from project-scoped members and shows their own", async () => {
    const { seed, team, ctx } = await setup();
    const projectId = new Types.ObjectId();
    await m.models.MemberScopeModel.create({
      orgId: seed.orgId,
      memberId: team.people.developer!.memberId,
      projectIds: [projectId],
    });
    await fire(ctx, seed); // domain has no project
    expect(await notes(seed, team.people.developer!.userId)).toHaveLength(0);
    expect(await notes(seed, team.people.admin!.userId)).toHaveLength(1);

    // A project-tagged incident reaches the scoped developer.
    await m.models.DomainModel.updateOne(
      { _id: seed.domain._id },
      { $set: { status: "failed", projectId } },
    );
    await alerts.createAlertRule(ctx, {
      name: "Domain",
      kind: "domain_status",
      condition: { operator: "gt", threshold: 0, windowMinutes: 0, minVolume: 0 },
    });
    await evaluation.evaluateOrgAlerts(seed.orgId);
    expect(await notes(seed, team.people.developer!.userId, "incident_opened")).toHaveLength(1);
  });

  it("follows each member's preferences and the rule's channels", async () => {
    const { seed, team, ctx } = await setup();
    // The admin turns alerts off in-app but keeps email; the developer turns email off.
    const channels = (inApp: boolean, email: boolean) => ({
      channels: { incident_opened: { inApp, email } },
      quietHours: null,
      digest: "none" as const,
    });
    const adminCtx = ctxFor(m, seed.orgId, "admin", { userId: team.people.admin!.userId });
    const devCtx = ctxFor(m, seed.orgId, "developer", { userId: team.people.developer!.userId });
    await notifications.updateNotificationPreferences(adminCtx, channels(false, true));
    await notifications.updateNotificationPreferences(devCtx, channels(true, false));
    await fire(ctx, seed);

    const admin = await notes(seed, team.people.admin!.userId);
    expect(admin).toHaveLength(1);
    // Emails go out as soon as an incident opens, so the row is already sent.
    expect(admin[0]).toMatchObject({ inApp: false, emailPending: false });
    expect(admin[0]!.emailedAt).toBeInstanceOf(Date);
    expect(outbox.findOutbox(team.people.admin!.email, "alert-fired")).toBeTruthy();
    expect(outbox.findOutbox(team.people.developer!.email)).toBeUndefined();
    const feed = await notifications.listNotifications(adminCtx);
    expect(feed.items).toHaveLength(0); // email-only rows never show in the feed
    expect(feed.unreadCount).toBe(0);

    const dev = await notes(seed, team.people.developer!.userId);
    expect(dev[0]).toMatchObject({ inApp: true, emailPending: false });
    expect(dev[0]!.emailedAt).toBeUndefined();
    // Owner uses defaults: in-app and email.
    expect((await notes(seed, team.people.owner!.userId))[0]).toMatchObject({ inApp: true });
    expect(outbox.findOutbox(team.people.owner!.email, "alert-fired")).toBeTruthy();
  });

  it("emails members (and extra addresses) when an incident opens, respecting the rule's channels", async () => {
    const { seed, team, ctx } = await setup();
    await alerts.createAlertRule(ctx, {
      ...bounceRule(),
      channels: { inApp: true, emailMembers: true, email: ["oncall@example.org"] },
    });
    await addRollup(m, seed, { sent: 100, bounced_hard: 10 });
    await evaluation.evaluateOrgAlerts(seed.orgId);

    const owner = outbox.findOutbox(team.people.owner!.email, "alert-fired");
    expect(owner?.subject).toMatch(/^Alert: Bounce rate is 10%/);
    expect(owner?.link).toContain(`/${team.slug}/alerts/incidents/`);
    expect(outbox.findOutbox(team.people.admin!.email, "alert-fired")).toBeTruthy();
    expect(outbox.findOutbox("oncall@example.org", "alert-fired")).toBeTruthy();
    expect(outbox.findOutbox(team.people.viewer!.email)).toBeUndefined();
    // Sent rows are marked and never sent twice.
    expect(await notifications.sendPendingNotificationEmails({ orgId: seed.orgId })).toMatchObject({
      sent: 0,
    });
    expect((await notes(seed, team.people.owner!.userId))[0]!.emailedAt).toBeInstanceOf(Date);

    // A rule with emailMembers off queues no member emails.
    const second = await setup();
    await alerts.createAlertRule(second.ctx, {
      ...bounceRule(),
      channels: { inApp: true, emailMembers: false, email: [] },
    });
    await addRollup(m, second.seed, { sent: 100, bounced_hard: 10 });
    await evaluation.evaluateOrgAlerts(second.seed.orgId);
    expect(outbox.findOutbox(second.team.people.owner!.email)).toBeUndefined();
    expect(await notes(second.seed, second.team.people.owner!.userId)).toHaveLength(1);
  });

  it("rate-limits emails per member per hour and holds them during quiet hours", async () => {
    const { seed, team } = await setup();
    const owner = team.people.owner!;
    const make = (n: number) =>
      notifications.createNotifications({
        orgId: seed.orgId,
        type: "incident_opened",
        title: `Problem ${n}`,
        link: `/${team.slug}/alerts`,
        audience: { userIds: [owner.userId] },
        dedupKey: `t:${n}`,
      });
    for (let i = 0; i < 12; i++) await make(i);
    const swept = await notifications.sendPendingNotificationEmails({ orgId: seed.orgId });
    expect(swept).toMatchObject({ sent: notifications.EMAIL_LIMIT_PER_HOUR, skipped: 2 });
    expect(await notes(seed, owner.userId)).toHaveLength(12); // in-app copies all exist
    expect(
      await m.models.NotificationModel.countDocuments({
        orgId: seed.orgId,
        emailSkipped: "rate_limited",
      }),
    ).toBe(2);

    // Quiet hours: 22:00 to 07:00 UTC. At 23:00 the email waits; at 08:00 it goes out.
    const other = await setup();
    const o = other.team.people.owner!;
    const ownerCtx = ctxFor(m, other.seed.orgId, "owner", { userId: o.userId });
    await notifications.updateNotificationPreferences(ownerCtx, {
      channels: {},
      quietHours: { start: "22:00", end: "07:00", timezone: "UTC" },
      digest: "none",
    });
    await notifications.createNotifications({
      orgId: other.seed.orgId,
      type: "incident_opened",
      title: "Night alert",
      link: "/x",
      audience: { userIds: [o.userId] },
    });
    const night = new Date(Date.UTC(2026, 8, 29, 23, 0));
    expect(
      await notifications.sendPendingNotificationEmails({ orgId: other.seed.orgId, now: night }),
    ).toMatchObject({ sent: 0, deferred: 1 });
    const morning = new Date(Date.UTC(2026, 8, 30, 8, 0));
    expect(
      await notifications.sendPendingNotificationEmails({ orgId: other.seed.orgId, now: morning }),
    ).toMatchObject({ sent: 1 });
  });

  it("quiet hours logic wraps midnight and honours the time zone", () => {
    const quiet = { start: "22:00", end: "07:00", timezone: "UTC" };
    expect(notifications.inQuietHours(quiet, new Date(Date.UTC(2026, 0, 1, 23, 30)))).toBe(true);
    expect(notifications.inQuietHours(quiet, new Date(Date.UTC(2026, 0, 1, 3, 0)))).toBe(true);
    expect(notifications.inQuietHours(quiet, new Date(Date.UTC(2026, 0, 1, 12, 0)))).toBe(false);
    expect(notifications.inQuietHours(quiet, new Date(Date.UTC(2026, 0, 1, 7, 0)))).toBe(false);
    const tokyo = { start: "09:00", end: "17:00", timezone: "Asia/Tokyo" };
    expect(notifications.inQuietHours(tokyo, new Date(Date.UTC(2026, 0, 1, 1, 0)))).toBe(true); // 10:00
    expect(notifications.inQuietHours(tokyo, new Date(Date.UTC(2026, 0, 1, 12, 0)))).toBe(false); // 21:00
    expect(notifications.inQuietHours(null, new Date())).toBe(false);
  });
});
