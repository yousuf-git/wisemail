import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { NotificationType } from "@/lib/notifications/types";
import { startTestDb } from "./helpers";
import { addRollup, seedTeam } from "./alerts-helpers";
import { ctxFor, emailData, loadMail, seedOrg, storeEvent, type Mail } from "./mail-helpers";

let stop: () => Promise<void>;
let m: Mail;
let notifications: typeof import("@/lib/services/notifications");
let mailNotices: typeof import("@/lib/services/mail-notifications");
let digest: typeof import("@/lib/services/digest");
let evaluation: typeof import("@/lib/services/alert-evaluation");
let alerts: typeof import("@/lib/services/alerts");
let outbox: typeof import("@/lib/services/system-email");

beforeAll(async () => {
  ({ stop } = await startTestDb("notifications"));
  m = await loadMail();
  notifications = await import("@/lib/services/notifications");
  mailNotices = await import("@/lib/services/mail-notifications");
  digest = await import("@/lib/services/digest");
  evaluation = await import("@/lib/services/alert-evaluation");
  alerts = await import("@/lib/services/alerts");
  outbox = await import("@/lib/services/system-email");
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

beforeEach(() => outbox.clearOutbox());

async function setup(options: { plan?: "free" | "pro"; timezone?: string } = {}) {
  const seed = await seedOrg(m, { plan: options.plan });
  const team = await seedTeam(m, seed, undefined, { timezone: options.timezone });
  const ctxOf = (role: string) =>
    ctxFor(m, seed.orgId, role as never, { userId: team.people[role]!.userId });
  return { seed, team, ctxOf };
}

const notes = (orgId: Types.ObjectId, userId: Types.ObjectId, type?: NotificationType) =>
  m.models.NotificationModel.find({ orgId, userId, ...(type ? { type } : {}) });

describe("mail event notifications (process-event)", () => {
  it("bounce and complaint notify members with activity access, per their preferences", async () => {
    const { seed, team, ctxOf } = await setup();
    // Owners opt in to bounce notifications (off by default); complaints are on by default.
    await notifications.updateNotificationPreferences(ctxOf("owner"), {
      channels: { bounce: { inApp: true, email: false } },
      quietHours: null,
      digest: "none",
    });
    const from = `Acme <hello@${seed.domain.name}>`;
    for (const [type, extra] of [
      ["email.sent", {}],
      ["email.bounced", { bounce: { type: "Permanent", message: "Mailbox full" } }],
      ["email.complained", {}],
    ] as const) {
      const id = await storeEvent(m, seed, type, emailData("em_n1", { from, ...extra }));
      await m.processing.processWebhookEvent(id);
    }
    const owner = team.people.owner!.userId;
    const bounce = await notes(seed.orgId, owner, "bounce");
    expect(bounce).toHaveLength(1);
    expect(bounce[0]!.title).toBe("Bounce: jane@customer.test");
    expect(bounce[0]!.body).toContain("Mailbox full");
    expect(await notes(seed.orgId, owner, "complaint")).toHaveLength(1);

    // The developer kept the defaults: complaints yes, bounces no. Viewers have no activity access
    // beyond reading; support has activity:read too.
    expect(await notes(seed.orgId, team.people.developer!.userId, "bounce")).toHaveLength(0);
    expect(await notes(seed.orgId, team.people.developer!.userId, "complaint")).toHaveLength(1);
    expect(await notes(seed.orgId, team.people.viewer!.userId, "complaint")).toHaveLength(1);

    // A redelivered event changes nothing.
    const again = await storeEvent(m, seed, "email.bounced", emailData("em_n1", { from }));
    await m.processing.processWebhookEvent(again);
    expect(await notes(seed.orgId, owner, "bounce")).toHaveLength(1);
  });

  it("tells the author (only) when a genuine first open arrives", async () => {
    const { seed, team } = await setup();
    const author = team.people.developer!.userId;
    const email = await m.models.EmailModel.create({
      orgId: seed.orgId,
      connectionId: seed.connectionId,
      resendId: "em_open",
      direction: "outbound",
      origin: "app",
      authorId: author,
      domainId: seed.domain._id,
      from: { address: `support@${seed.domain.name}` },
      to: [{ address: "jane@customer.test", name: "Jane" }],
      subject: "Your invoice",
      status: "delivered",
      deliveredAt: new Date(Date.now() - 3_600_000),
    });
    const id = await storeEvent(m, seed, "email.opened", emailData("em_open"));
    await m.processing.processWebhookEvent(id);
    const got = await notes(seed.orgId, author, "reply_opened");
    expect(got).toHaveLength(1);
    expect(got[0]!.title).toBe("Jane opened your email");
    expect(got[0]!.link).toBe(`/${team.slug}/activity/${email._id}`);
    expect(await notes(seed.orgId, team.people.owner!.userId, "reply_opened")).toHaveLength(0);

    // A second open is not news.
    const second = await storeEvent(m, seed, "email.opened", emailData("em_open"));
    await m.processing.processWebhookEvent(second);
    expect(await notes(seed.orgId, author, "reply_opened")).toHaveLength(1);
  });

  it("inbound mail notifies members with inbox access, scoped members only for their projects", async () => {
    const { seed, team } = await setup();
    const projectId = new Types.ObjectId();
    await m.models.MemberScopeModel.create({
      orgId: seed.orgId,
      memberId: team.people.support!.memberId,
      projectIds: [projectId],
    });
    const emailId = new Types.ObjectId();
    const threadId = new Types.ObjectId();
    await mailNotices.notifyInboundReceived({
      orgId: seed.orgId,
      emailId,
      threadId,
      projectId: null,
      from: { address: "jane@customer.test", name: "Jane" },
      subject: "Question",
    });
    const link = `/${team.slug}/inbox/${threadId}`;
    expect(
      (await notes(seed.orgId, team.people.owner!.userId, "inbound_received"))[0],
    ).toMatchObject({ title: "New email from Jane", body: "Question", link });
    expect(await notes(seed.orgId, team.people.viewer!.userId, "inbound_received")).toHaveLength(1);
    // The scoped support member has no access to project-less mail.
    expect(await notes(seed.orgId, team.people.support!.userId)).toHaveLength(0);
    // Same email, same recipients: idempotent.
    await mailNotices.notifyInboundReceived({
      orgId: seed.orgId,
      emailId,
      threadId,
      projectId: null,
      from: { address: "jane@customer.test" },
      subject: "Question",
    });
    expect(await notes(seed.orgId, team.people.owner!.userId, "inbound_received")).toHaveLength(1);
    // Mail in the scoped project does reach them.
    await mailNotices.notifyInboundReceived({
      orgId: seed.orgId,
      emailId: new Types.ObjectId(),
      threadId,
      projectId,
      from: { address: "x@y.test" },
      subject: "In project",
    });
    expect(await notes(seed.orgId, team.people.support!.userId)).toHaveLength(1);
  });

  it("domain changes go to members who manage domains", async () => {
    const { seed, team } = await setup();
    const id = await storeEvent(m, seed, "domain.updated", {
      id: seed.domain.resendId,
      status: "failed",
    });
    await m.processing.processWebhookEvent(id);
    for (const role of ["owner", "admin", "developer"]) {
      const [n] = await notes(seed.orgId, team.people[role]!.userId, "domain_changed");
      expect(n?.title).toBe(`${seed.domain.name} is now failed`);
    }
    expect(await notes(seed.orgId, team.people.viewer!.userId)).toHaveLength(0);
  });

  it("asks for an alert evaluation only when the org has enabled rules", async () => {
    const { seed, ctxOf } = await setup();
    const from = `Acme <hello@${seed.domain.name}>`;
    const first = await storeEvent(m, seed, "email.sent", emailData("em_a1", { from }));
    expect((await m.processing.processWebhookEvent(first)).alertOrgId).toBeUndefined();
    await alerts.createAlertRule(ctxOf("owner"), {
      name: "Any complaint",
      kind: "complaint_any",
      condition: { operator: "gt", threshold: 0, windowMinutes: 60, minVolume: 0 },
    });
    const second = await storeEvent(m, seed, "email.sent", emailData("em_a2", { from }));
    expect((await m.processing.processWebhookEvent(second)).alertOrgId).toBe(
      seed.orgId.toHexString(),
    );
    // Redelivery of a processed event does not ask again.
    expect((await m.processing.processWebhookEvent(second)).alertOrgId).toBeUndefined();
  });
});

describe("the member's feed", () => {
  it("lists newest first with a cursor, counts unread, marks read and all read", async () => {
    const { seed, team, ctxOf } = await setup();
    const owner = team.people.owner!;
    for (let i = 0; i < 5; i++) {
      await notifications.createNotifications({
        orgId: seed.orgId,
        type: "inbound_received",
        title: `Mail ${i}`,
        link: "/x",
        audience: { userIds: [owner.userId] },
        dedupKey: `feed:${i}`,
      });
    }
    const ctx = ctxOf("owner");
    const page1 = await notifications.listNotifications(ctx, { limit: 2 });
    expect(page1.items.map((n) => n.title)).toEqual(["Mail 4", "Mail 3"]);
    expect(page1.unreadCount).toBe(5);
    const page2 = await notifications.listNotifications(ctx, {
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items.map((n) => n.title)).toEqual(["Mail 2", "Mail 1"]);

    expect(await notifications.markNotificationsRead(ctx, [page1.items[0]!.id])).toMatchObject({
      updated: 1,
      unreadCount: 4,
    });
    expect((await notifications.listNotifications(ctx, { unreadOnly: true })).items).toHaveLength(
      4,
    );
    expect(await notifications.markAllNotificationsRead(ctx)).toMatchObject({ updated: 4 });
    expect(await notifications.getUnreadCount(ctx)).toBe(0);
  });

  it("never exposes or changes another member's or org's notifications", async () => {
    const a = await setup();
    const b = await setup();
    await notifications.createNotifications({
      orgId: a.seed.orgId,
      type: "inbound_received",
      title: "Private",
      link: "/x",
      audience: { userIds: [a.team.people.owner!.userId] },
    });
    const [row] = await notes(a.seed.orgId, a.team.people.owner!.userId);
    expect((await notifications.listNotifications(a.ctxOf("admin"))).items).toHaveLength(0);
    expect((await notifications.listNotifications(b.ctxOf("owner"))).items).toHaveLength(0);
    expect(await notifications.markNotificationsRead(a.ctxOf("admin"), [row!.id])).toMatchObject({
      updated: 0,
    });
    expect(await notifications.markNotificationsRead(b.ctxOf("owner"), [row!.id])).toMatchObject({
      updated: 0,
    });
    expect(await notifications.getUnreadCount(a.ctxOf("owner"))).toBe(1);
  });

  it("stores preferences with defaults for the rest, and gates digests behind Pro", async () => {
    const free = await setup({ plan: "free" });
    const ctx = free.ctxOf("owner");
    const initial = await notifications.getNotificationPreferences(ctx);
    expect(initial).toMatchObject({
      digest: "none",
      digestAllowed: false,
      quietHours: null,
      channels: {
        incident_opened: { inApp: true, email: true },
        bounce: { inApp: false, email: false },
      },
    });
    await expect(
      notifications.updateNotificationPreferences(ctx, {
        channels: {},
        quietHours: null,
        digest: "daily",
      }),
    ).rejects.toMatchObject({ code: "plan_feature_locked" });

    await m.models.OrgSettingsModel.updateOne({ orgId: free.seed.orgId }, { plan: "pro" });
    const saved = await notifications.updateNotificationPreferences(ctx, {
      channels: { complaint: { inApp: false, email: true } },
      quietHours: { start: "22:00", end: "07:00" },
      digest: "daily",
    });
    expect(saved).toMatchObject({
      digest: "daily",
      digestAllowed: true,
      quietHours: { start: "22:00", end: "07:00", timezone: "UTC" },
      channels: {
        complaint: { inApp: false, email: true },
        bounce: { inApp: false, email: false },
      },
    });
  });
});

describe("daily digest", () => {
  it("sends one email per opted-in member at the org's local hour, with real content", async () => {
    const { seed, team, ctxOf } = await setup({ plan: "pro", timezone: "Asia/Tokyo" });
    // 08:05 in Tokyo is 23:05 UTC the day before; the digest covers the 24 hours before that.
    const tokyoMorning = new Date(Date.UTC(2026, 8, 28, 23, 5));
    await addRollup(
      m,
      seed,
      {
        sent: 120,
        delivered: 110,
        bounced_hard: 3,
        bounced_soft: 1,
        complained: 1,
        opened_unique: 40,
        received: 7,
      },
      new Date(tokyoMorning.getTime() - 3_600_000),
    );
    await alerts.createAlertRule(ctxOf("owner"), {
      name: "Bounce",
      kind: "bounce_rate",
      condition: { operator: "gt", threshold: 2, windowMinutes: 60, minVolume: 10 },
    });
    await evaluation.evaluateOrgAlerts(seed.orgId, { now: tokyoMorning });
    outbox.clearOutbox();

    for (const role of ["owner", "developer"]) {
      await notifications.updateNotificationPreferences(ctxOf(role), {
        channels: {},
        quietHours: null,
        digest: "daily",
      });
    }
    // Not yet the digest hour anywhere near now.
    expect(
      await digest.sendDailyDigests({ now: new Date(Date.UTC(2026, 8, 29, 3, 5)) }),
    ).toMatchObject({ sent: 0 });
    const run = await digest.sendDailyDigests({ now: tokyoMorning });
    expect(run.sent).toBe(2);
    const mail = outbox.findOutbox(team.people.owner!.email, "daily-digest")!;
    expect(mail.subject).toBe("Acme daily digest, Tuesday 29 September");
    expect(mail.text).toMatch(/120/); // sent
    expect(mail.text).toMatch(/Bounce rate is/); // the incident
    expect(outbox.findOutbox(team.people.developer!.email, "daily-digest")).toBeTruthy();
    expect(outbox.findOutbox(team.people.admin!.email, "daily-digest")).toBeUndefined();

    // A second run within the day sends nothing.
    expect(await digest.sendDailyDigests({ now: tokyoMorning })).toMatchObject({ sent: 0 });
  });

  it("scopes stats to a project-scoped member's projects and skips the Free plan", async () => {
    const { seed, team, ctxOf } = await setup({ plan: "pro" });
    const projectId = new Types.ObjectId();
    // Rollup buckets are per domain, and a domain belongs to one project: use two domains.
    await addRollup(m, seed, { sent: 50 }, new Date(), projectId);
    await addRollup(m, { ...seed, domain: { _id: new Types.ObjectId() } }, { sent: 5 });
    const orgId = seed.orgId;
    const now = new Date();
    expect((await digest.digestStats(orgId, now, null)).sent).toBe(55);
    expect((await digest.digestStats(orgId, now, [projectId])).sent).toBe(50);
    expect((await digest.digestStats(orgId, now, [new Types.ObjectId()])).sent).toBe(0);

    await notifications.updateNotificationPreferences(ctxOf("owner"), {
      channels: {},
      quietHours: null,
      digest: "daily",
    });
    await m.models.OrgSettingsModel.updateOne({ orgId }, { plan: "free" });
    const utc8 = new Date(Date.UTC(2026, 8, 29, 8, 5));
    await digest.sendDailyDigests({ now: utc8 }); // other test orgs may be due; this one is on Free
    expect(outbox.findOutbox(team.people.owner!.email)).toBeUndefined();
  });
});
