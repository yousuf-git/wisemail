import "server-only";

import mongoose, { Types, type ClientSession } from "mongoose";

import { roleHasPermission, type Permission } from "@/lib/auth/permissions";
import { assertFeature, getEntitlements } from "@/lib/billing/entitlements";
import type { OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { MemberScopeModel } from "@/lib/db/models/member-scopes";
import {
  NOTIFICATION_TTL_DAYS,
  NotificationModel,
  type NotificationDoc,
} from "@/lib/db/models/notifications";
import { NotificationPreferencesModel } from "@/lib/db/models/notification-preferences";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import type {
  NotificationDTO,
  NotificationPreferencesDTO,
  NotificationsPage,
} from "@/lib/dto/notification";
import { env } from "@/lib/env";
import {
  PREFERENCE_INFO,
  PREFERENCE_TYPES,
  defaultChannel,
  type ChannelPref,
  type NotificationType,
} from "@/lib/notifications/types";
import { publish } from "@/lib/realtime/publish";
import { topics } from "@/lib/realtime/topics";
import type { NotificationPreferencesInput } from "@/lib/validation/alert";
import { roleIsScopable } from "./project-scope";
import { sendAlertEmail } from "./system-email";

/**
 * In-app notifications and their email channel (PRD §5.6, DBD §4.8).
 *
 * Fan-out (`createNotifications`) picks the recipients (members whose role grants `permission`
 * and whose project scope allows the item), applies each member's preferences and writes one
 * document per recipient, idempotently by `dedupKey`. The email channel is an outbox: fan-out
 * only marks rows `emailPending`; `sendPendingNotificationEmails` sends them after commit, with
 * a per-member hourly limit and quiet hours.
 */

/** Emails per member and organization per hour; beyond that the in-app copy still arrives. */
export const EMAIL_LIMIT_PER_HOUR = 10;
/** A queued email that could not go out for this long during quiet hours is dropped. */
const QUIET_HOURS_MAX_WAIT_MS = 12 * 3_600_000;
const MAX_EMAIL_ATTEMPTS = 3;

type Quiet = { start: string; end: string; timezone: string };

/* ------------------------------------------------------------------------------------------ */
/* Pure helpers                                                                                */
/* ------------------------------------------------------------------------------------------ */

/** Minutes since midnight of `at` in `timeZone` (falls back to UTC for an unknown zone). */
export function minutesInZone(at: Date, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
  }
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return num("hour") * 60 + num("minute");
}

const toMinutes = (hhmm: string) => {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
};

/** True when `at` falls inside the quiet window (which may wrap past midnight). */
export function inQuietHours(quiet: Quiet | null | undefined, at: Date): boolean {
  if (!quiet) return false;
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  if (start === end) return false;
  const now = minutesInZone(at, quiet.timezone);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

export type EffectivePrefs = {
  channels: Record<string, ChannelPref>;
  quietHours: Quiet | null;
  digest: "none" | "daily" | "weekly";
};

export function effectiveChannel(
  prefs: Pick<EffectivePrefs, "channels"> | null | undefined,
  type: string,
): ChannelPref {
  const stored = prefs?.channels?.[type];
  const base = defaultChannel(type);
  return { inApp: stored?.inApp ?? base.inApp, email: stored?.email ?? base.email };
}

/* ------------------------------------------------------------------------------------------ */
/* Recipients                                                                                  */
/* ------------------------------------------------------------------------------------------ */

export type Recipient = {
  userId: Types.ObjectId;
  memberId: Types.ObjectId;
  role: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

export type Audience = {
  /** Members whose role grants this permission... */
  permission?: Permission;
  /** ...or exactly these users (still filtered by membership and project scope). */
  userIds?: readonly Types.ObjectId[];
};

/**
 * Members of the org who may see an item: role permission (or an explicit user list) AND project
 * scope (`projectId` null means "not in any project": scoped members never see it).
 */
export async function resolveRecipients(
  orgId: Types.ObjectId,
  audience: Audience,
  projectId: Types.ObjectId | null,
  options: { session?: ClientSession } = {},
): Promise<Recipient[]> {
  const db = mongoose.connection;
  const members = await db
    .collection("member")
    .find({ organizationId: orgId }, { session: options.session })
    .toArray();
  const wanted = audience.userIds ? new Set(audience.userIds.map(String)) : null;
  const eligible = members.filter(
    (m) =>
      (!wanted || wanted.has(String(m.userId))) &&
      (!audience.permission || roleHasPermission(String(m.role), audience.permission)),
  );
  if (eligible.length === 0) return [];

  const scopes = await MemberScopeModel.find(
    { orgId, memberId: { $in: eligible.map((m) => m._id) } },
    { memberId: 1, projectIds: 1 },
    { session: options.session },
  ).lean();
  const scopeByMember = new Map(scopes.map((s) => [String(s.memberId), s.projectIds.map(String)]));
  const allowed = eligible.filter((m) => {
    if (!roleIsScopable(String(m.role))) return true;
    const scope = scopeByMember.get(String(m._id));
    if (!scope) return true;
    return !!projectId && scope.includes(String(projectId));
  });

  const users = await db
    .collection("user")
    .find(
      { _id: { $in: allowed.map((m) => m.userId) } },
      { projection: { name: 1, email: 1, emailVerified: 1 }, session: options.session },
    )
    .toArray();
  const byUser = new Map(users.map((u) => [String(u._id), u]));
  return allowed.flatMap((m) => {
    const u = byUser.get(String(m.userId));
    return u
      ? [
          {
            userId: m.userId as Types.ObjectId,
            memberId: m._id as Types.ObjectId,
            role: String(m.role),
            name: String(u.name ?? ""),
            email: String(u.email),
            emailVerified: !!u.emailVerified,
          },
        ]
      : [];
  });
}

/* ------------------------------------------------------------------------------------------ */
/* Fan-out                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export type NotifyInput = {
  orgId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body?: string;
  /** In-app path including the org slug. */
  link: string;
  refs?: {
    emailId?: Types.ObjectId | null;
    threadId?: Types.ObjectId | null;
    incidentId?: Types.ObjectId | null;
    connectionId?: Types.ObjectId | null;
    domainId?: Types.ObjectId | null;
  };
  projectId?: Types.ObjectId | null;
  audience: Audience;
  /** Extra per-notification gates (e.g. an alert rule's channels), ANDed with preferences. */
  channels?: { inApp?: boolean; email?: boolean };
  /** Same key + recipient = one notification, however often this runs. */
  dedupKey?: string;
  now?: Date;
};

export type NotifyResult = {
  /** Recipients that got a new notification (already-existing dedup keys are not counted). */
  created: { userId: string; notificationId: string }[];
  emailQueued: number;
};

export async function getPreferenceDocs(
  orgId: Types.ObjectId,
  userIds: readonly Types.ObjectId[],
  options: { session?: ClientSession } = {},
) {
  const docs = await NotificationPreferencesModel.find({ orgId, userId: { $in: userIds } }, null, {
    session: options.session,
  }).lean();
  return new Map(docs.map((d) => [String(d.userId), d]));
}

export async function createNotifications(
  input: NotifyInput,
  options: { session?: ClientSession } = {},
): Promise<NotifyResult> {
  const { session } = options;
  const now = input.now ?? new Date();
  const recipients = await resolveRecipients(input.orgId, input.audience, input.projectId ?? null, {
    session,
  });
  if (recipients.length === 0) return { created: [], emailQueued: 0 };
  const prefs = await getPreferenceDocs(
    input.orgId,
    recipients.map((r) => r.userId),
    { session },
  );

  const result: NotifyResult = { created: [], emailQueued: 0 };
  for (const r of recipients) {
    const channel = effectiveChannel(
      prefs.get(String(r.userId)) as Pick<EffectivePrefs, "channels"> | undefined,
      input.type,
    );
    const inApp = channel.inApp && (input.channels?.inApp ?? true);
    const email = channel.email && (input.channels?.email ?? true) && r.emailVerified;
    if (!inApp && !email) continue;

    const doc = {
      orgId: input.orgId,
      userId: r.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      link: input.link,
      refs: Object.fromEntries(Object.entries(input.refs ?? {}).filter(([, v]) => !!v)),
      inApp,
      emailPending: email,
      readAt: null,
      expireAt: new Date(now.getTime() + NOTIFICATION_TTL_DAYS * 86_400_000),
      createdAt: now,
    };
    let id: Types.ObjectId | null = null;
    if (input.dedupKey) {
      const res = await NotificationModel.findOneAndUpdate(
        { orgId: input.orgId, userId: r.userId, dedupKey: input.dedupKey },
        { $setOnInsert: { ...doc, dedupKey: input.dedupKey } },
        {
          upsert: true,
          includeResultMetadata: true,
          returnDocument: "after",
          session,
          timestamps: false,
        },
      );
      // `lastErrorObject.updatedExisting` is false only when this call inserted the row.
      if (!res.lastErrorObject?.updatedExisting) id = res.value!._id;
    } else {
      const [created] = await NotificationModel.create([doc], { session, timestamps: false });
      id = created!._id;
    }
    if (!id) continue;
    result.created.push({ userId: String(r.userId), notificationId: String(id) });
    if (email) result.emailQueued += 1;
    if (inApp) {
      await publish(
        {
          orgId: input.orgId,
          userId: r.userId,
          topics: [topics.notifications(input.orgId, r.userId)],
          patch: { notificationId: String(id), type: input.type },
        },
        { session },
      );
    }
  }
  return result;
}

/* ------------------------------------------------------------------------------------------ */
/* Email channel                                                                               */
/* ------------------------------------------------------------------------------------------ */

export type EmailSweepResult = { sent: number; skipped: number; deferred: number; failed: number };

/**
 * Sends queued notification emails. Safe to run concurrently or repeatedly: a row is claimed
 * (`emailPending` cleared) before its email goes out and restored if sending fails.
 */
export async function sendPendingNotificationEmails(
  options: { orgId?: Types.ObjectId; now?: Date; limit?: number } = {},
): Promise<EmailSweepResult> {
  await connectDb();
  const now = options.now ?? new Date();
  const result: EmailSweepResult = { sent: 0, skipped: 0, deferred: 0, failed: 0 };
  const pending = await NotificationModel.find({
    emailPending: true,
    ...(options.orgId ? { orgId: options.orgId } : {}),
  })
    .sort({ createdAt: 1 })
    .limit(options.limit ?? 200)
    .lean();
  if (pending.length === 0) return result;

  const orgIds = [...new Set(pending.map((n) => String(n.orgId)))].map(
    (i) => new Types.ObjectId(i),
  );
  const userIds = [...new Set(pending.map((n) => String(n.userId)))].map(
    (i) => new Types.ObjectId(i),
  );
  const [orgs, users, prefDocs, settings] = await Promise.all([
    mongoose.connection
      .collection("organization")
      .find({ _id: { $in: orgIds } }, { projection: { name: 1, slug: 1 } })
      .toArray(),
    mongoose.connection
      .collection("user")
      .find({ _id: { $in: userIds } }, { projection: { email: 1, name: 1, emailVerified: 1 } })
      .toArray(),
    NotificationPreferencesModel.find({ orgId: { $in: orgIds }, userId: { $in: userIds } }).lean(),
    OrgSettingsModel.find({ orgId: { $in: orgIds } }, { orgId: 1, timezone: 1 }).lean(),
  ]);
  const orgById = new Map(orgs.map((o) => [String(o._id), o]));
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const prefFor = new Map(prefDocs.map((p) => [`${p.orgId}:${p.userId}`, p]));
  const tzByOrg = new Map(settings.map((s) => [String(s.orgId), s.timezone]));
  const hourAgo = new Date(now.getTime() - 3_600_000);

  for (const n of pending) {
    const user = userById.get(String(n.userId));
    const org = orgById.get(String(n.orgId));
    const clear = (extra: Record<string, unknown> = {}) =>
      NotificationModel.updateOne({ _id: n._id }, { $set: { emailPending: false, ...extra } });

    if (!user?.emailVerified || !org) {
      await clear();
      result.skipped += 1;
      continue;
    }
    const pref = prefFor.get(`${n.orgId}:${n.userId}`);
    const quiet = pref?.quietHours
      ? {
          ...pref.quietHours,
          timezone: pref.quietHours.timezone || tzByOrg.get(String(n.orgId)) || "UTC",
        }
      : null;
    if (inQuietHours(quiet, now)) {
      if (now.getTime() - (n.createdAt?.getTime() ?? now.getTime()) > QUIET_HOURS_MAX_WAIT_MS) {
        await clear({ emailSkipped: "quiet_hours" });
        result.skipped += 1;
      } else result.deferred += 1;
      continue;
    }
    const sentLastHour = await NotificationModel.countDocuments({
      orgId: n.orgId,
      userId: n.userId,
      emailedAt: { $gte: hourAgo },
    });
    if (sentLastHour >= EMAIL_LIMIT_PER_HOUR) {
      await clear({ emailSkipped: "rate_limited" });
      result.skipped += 1;
      continue;
    }

    // Claim before sending so a concurrent sweep can't send it twice.
    const claimed = await NotificationModel.findOneAndUpdate(
      { _id: n._id, emailPending: true },
      { $set: { emailPending: false, emailedAt: now } },
    );
    if (!claimed) continue;
    try {
      await sendAlertEmail(String(user.email), {
        orgName: String(org.name),
        title: n.title,
        summary: n.body || n.title,
        url: absoluteUrl(n.link),
        state:
          n.type === "incident_opened"
            ? "open"
            : n.type === "incident_resolved"
              ? "resolved"
              : "info",
      });
      result.sent += 1;
    } catch (error) {
      console.error("[notifications] email failed", error);
      const attempts = (n.emailAttempts ?? 0) + 1;
      await NotificationModel.updateOne(
        { _id: n._id },
        {
          $set: { emailPending: attempts < MAX_EMAIL_ATTEMPTS, emailAttempts: attempts },
          $unset: { emailedAt: 1 },
        },
      );
      result.failed += 1;
    }
  }
  return result;
}

export const absoluteUrl = (path: string) => `${env.APP_URL.replace(/\/$/, "")}${path}`;

/* ------------------------------------------------------------------------------------------ */
/* Reading and marking (the signed-in member's own feed)                                        */
/* ------------------------------------------------------------------------------------------ */

const own = (ctx: OrgContext) => ({
  orgId: new Types.ObjectId(ctx.org.id),
  userId: new Types.ObjectId(ctx.user.id),
  inApp: { $ne: false },
});

function toDTO(
  doc: Pick<NotificationDoc, "_id" | "type" | "title" | "body" | "link" | "readAt"> & {
    createdAt?: Date;
  },
): NotificationDTO {
  return {
    id: doc._id.toHexString(),
    type: doc.type,
    title: doc.title,
    body: doc.body ?? "",
    link: doc.link,
    readAt: doc.readAt?.toISOString() ?? null,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}

export async function getUnreadCount(ctx: OrgContext): Promise<number> {
  await connectDb();
  return NotificationModel.countDocuments({ ...own(ctx), readAt: null });
}

export async function listNotifications(
  ctx: OrgContext,
  query: { unreadOnly?: boolean; limit?: number; cursor?: string | null } = {},
): Promise<NotificationsPage> {
  await connectDb();
  const limit = Math.min(Math.max(query.limit ?? 30, 1), 100);
  const cursor =
    query.cursor && /^[0-9a-f]{24}$/i.test(query.cursor) ? new Types.ObjectId(query.cursor) : null;
  const filter = {
    ...own(ctx),
    ...(query.unreadOnly ? { readAt: null } : {}),
    ...(cursor ? { _id: { $lt: cursor } } : {}),
  };
  const [rows, unreadCount] = await Promise.all([
    NotificationModel.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean(),
    getUnreadCount(ctx),
  ]);
  const page = rows.slice(0, limit);
  return {
    items: page.map(toDTO),
    unreadCount,
    nextCursor: rows.length > limit ? page[page.length - 1]!._id.toHexString() : null,
  };
}

async function announceRead(ctx: OrgContext) {
  const orgId = new Types.ObjectId(ctx.org.id);
  const userId = new Types.ObjectId(ctx.user.id);
  await publish({ orgId, userId, topics: [topics.notifications(orgId, userId)] });
}

export async function markNotificationsRead(
  ctx: OrgContext,
  ids: string[],
): Promise<{ updated: number; unreadCount: number }> {
  await connectDb();
  const res = await NotificationModel.updateMany(
    {
      ...own(ctx),
      _id: { $in: ids.filter((i) => /^[0-9a-f]{24}$/i.test(i)).map((i) => new Types.ObjectId(i)) },
      readAt: null,
    },
    { $set: { readAt: new Date() } },
  );
  if (res.modifiedCount > 0) await announceRead(ctx);
  return { updated: res.modifiedCount, unreadCount: await getUnreadCount(ctx) };
}

export async function markAllNotificationsRead(
  ctx: OrgContext,
): Promise<{ updated: number; unreadCount: number }> {
  await connectDb();
  const res = await NotificationModel.updateMany(
    { ...own(ctx), readAt: null },
    { $set: { readAt: new Date() } },
  );
  if (res.modifiedCount > 0) await announceRead(ctx);
  return { updated: res.modifiedCount, unreadCount: 0 };
}

/* ------------------------------------------------------------------------------------------ */
/* Preferences                                                                                 */
/* ------------------------------------------------------------------------------------------ */

export async function getNotificationPreferences(
  ctx: OrgContext,
): Promise<NotificationPreferencesDTO> {
  await connectDb();
  const orgId = new Types.ObjectId(ctx.org.id);
  const [doc, settings, entitlements] = await Promise.all([
    NotificationPreferencesModel.findOne({ orgId, userId: new Types.ObjectId(ctx.user.id) }).lean(),
    OrgSettingsModel.findOne({ orgId }, { timezone: 1 }).lean(),
    getEntitlements(orgId),
  ]);
  return {
    channels: Object.fromEntries(
      PREFERENCE_TYPES.map((t) => [t, effectiveChannel(doc as EffectivePrefs | null, t)]),
    ),
    quietHours: doc?.quietHours ?? null,
    digest: doc?.digest === "daily" ? "daily" : "none",
    orgTimezone: settings?.timezone ?? "UTC",
    digestAllowed: entitlements.features.digests,
    planLabel: entitlements.planLabel,
  };
}

export async function updateNotificationPreferences(
  ctx: OrgContext,
  input: NotificationPreferencesInput,
): Promise<NotificationPreferencesDTO> {
  await connectDb();
  const orgId = new Types.ObjectId(ctx.org.id);
  if (input.digest !== "none") await assertFeature(orgId, "digests");
  const settings = await OrgSettingsModel.findOne({ orgId }, { timezone: 1 }).lean();
  const channels = Object.fromEntries(
    PREFERENCE_TYPES.map((t) => [t, input.channels[t] ?? PREFERENCE_INFO[t].defaults]),
  );
  await NotificationPreferencesModel.updateOne(
    { orgId, userId: new Types.ObjectId(ctx.user.id) },
    {
      $set: {
        channels,
        quietHours: input.quietHours
          ? {
              start: input.quietHours.start,
              end: input.quietHours.end,
              timezone: input.quietHours.timezone ?? settings?.timezone ?? "UTC",
            }
          : null,
        digest: input.digest,
      },
      $setOnInsert: { digestLastSentAt: null },
    },
    { upsert: true },
  );
  return getNotificationPreferences(ctx);
}
