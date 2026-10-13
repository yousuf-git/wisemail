import "server-only";

import mongoose, { Types } from "mongoose";

import type { DigestProps } from "@/emails/daily-digest";
import { planAllowsDigest } from "@/lib/billing/plans";
import { connectDb } from "@/lib/db/connect";
import { AlertIncidentModel } from "@/lib/db/models/alert-incidents";
import { MetricRollupModel } from "@/lib/db/models/metric-rollups";
import { NotificationModel } from "@/lib/db/models/notifications";
import { NotificationPreferencesModel } from "@/lib/db/models/notification-preferences";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { DIGEST_HOUR } from "@/lib/notifications/types";
import { absoluteUrl, minutesInZone } from "./notifications";
import { bucketStart } from "./rollups";
import { sendDigestEmail } from "./system-email";

/**
 * Daily digest (PRD §5.6, Pro and above): one email per opted-in member, sent when the local
 * time in the organization's time zone reaches `DIGEST_HOUR`. The cron runs hourly, so each org
 * is picked once a day; `digestLastSentAt` makes a second run in the same hour a no-op.
 */

export type DigestStats = DigestProps["stats"];

const emptyStats = (): DigestStats => ({
  sent: 0,
  delivered: 0,
  bounced: 0,
  complained: 0,
  opened: 0,
  received: 0,
});

/** Last 24 hours of hourly rollups, limited to `projectIds` for scoped members. */
export async function digestStats(
  orgId: Types.ObjectId,
  now: Date,
  projectIds: Types.ObjectId[] | null,
): Promise<DigestStats> {
  const from = bucketStart(new Date(now.getTime() - 24 * 3_600_000), "hour");
  const [row] = await MetricRollupModel.aggregate<DigestStats & { _id: null }>([
    {
      $match: {
        orgId,
        granularity: "hour",
        "dimension.kind": "all",
        bucketStart: { $gte: from, $lte: now },
        ...(projectIds ? { projectId: { $in: projectIds } } : {}),
      },
    },
    {
      $group: {
        _id: null,
        sent: { $sum: "$counts.sent" },
        delivered: { $sum: "$counts.delivered" },
        bounced: {
          $sum: {
            // Counters are only created when first incremented, so a missing one is null.
            $add: [
              { $ifNull: ["$counts.bounced_hard", 0] },
              { $ifNull: ["$counts.bounced_soft", 0] },
            ],
          },
        },
        complained: { $sum: "$counts.complained" },
        opened: { $sum: "$counts.opened_unique" },
        received: { $sum: "$counts.received" },
      },
    },
  ]);
  return row ? { ...emptyStats(), ...row } : emptyStats();
}

export async function buildDigest(input: {
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  orgName: string;
  orgSlug: string;
  timezone: string;
  projectIds: Types.ObjectId[] | null;
  now: Date;
}): Promise<DigestProps> {
  const { orgId, userId, now } = input;
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const [stats, incidents, unread] = await Promise.all([
    digestStats(orgId, now, input.projectIds),
    AlertIncidentModel.find({
      orgId,
      ...(input.projectIds ? { projectId: { $in: input.projectIds } } : {}),
      $or: [{ active: true }, { openedAt: { $gte: since } }, { resolvedAt: { $gte: since } }],
    })
      .sort({ active: -1, openedAt: -1 })
      .limit(5)
      .lean(),
    NotificationModel.countDocuments({ orgId, userId, inApp: { $ne: false }, readAt: null }),
  ]);
  return {
    orgName: input.orgName,
    dateLabel: new Intl.DateTimeFormat("en-GB", {
      timeZone: input.timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(now),
    stats,
    incidents: incidents.map((i) => ({
      title: i.title,
      status: i.status,
      url: absoluteUrl(`/${input.orgSlug}/alerts/incidents/${i._id}`),
    })),
    unreadNotifications: unread,
    url: absoluteUrl(`/${input.orgSlug}`),
  };
}

const safeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
};

export type DigestRun = { orgs: number; sent: number };

/** Sends the digest to everyone due right now. Idempotent within the day. */
export async function sendDailyDigests(options: { now?: Date } = {}): Promise<DigestRun> {
  await connectDb();
  const now = options.now ?? new Date();
  const result: DigestRun = { orgs: 0, sent: 0 };
  const orgIds = await NotificationPreferencesModel.distinct("orgId", { digest: "daily" });
  if (orgIds.length === 0) return result;

  const settings = await OrgSettingsModel.find({ orgId: { $in: orgIds }, deletedAt: null }).lean();
  const organizations = await mongoose.connection
    .collection("organization")
    .find({ _id: { $in: orgIds } }, { projection: { name: 1, slug: 1 } })
    .toArray();
  const orgById = new Map(organizations.map((o) => [String(o._id), o]));

  for (const s of settings) {
    const timezone = safeZone(s.timezone);
    if (Math.floor(minutesInZone(now, timezone) / 60) !== DIGEST_HOUR) continue;
    if (!planAllowsDigest(s.plan)) continue;
    const org = orgById.get(String(s.orgId));
    if (!org) continue;
    result.orgs += 1;

    const due = await NotificationPreferencesModel.find({
      orgId: s.orgId,
      digest: "daily",
      $or: [
        { digestLastSentAt: null },
        { digestLastSentAt: { $lt: new Date(now.getTime() - 20 * 3_600_000) } },
      ],
    }).lean();
    if (due.length === 0) continue;
    // Only current members with a confirmed address get one (people who left keep a stale
    // preference row).
    const scopes = await mongoose.connection
      .collection("member_scopes")
      .find({ orgId: s.orgId })
      .toArray();
    const scopeByMember = new Map(
      scopes.map((sc) => [String(sc.memberId), sc.projectIds as Types.ObjectId[]]),
    );
    const members = await mongoose.connection
      .collection("member")
      .find({ organizationId: s.orgId, userId: { $in: due.map((d) => d.userId) } })
      .toArray();
    const users = await mongoose.connection
      .collection("user")
      .find({ _id: { $in: members.map((m) => m.userId) } })
      .toArray();

    for (const member of members) {
      const user = users.find((u) => String(u._id) === String(member.userId));
      if (!user?.emailVerified) continue;
      const projectIds = scopeByMember.get(String(member._id)) ?? null;
      try {
        const props = await buildDigest({
          orgId: s.orgId,
          userId: member.userId,
          orgName: String(org.name),
          orgSlug: String(org.slug),
          timezone,
          projectIds,
          now,
        });
        // Claim first: a concurrent run can't send the same digest twice.
        const claimed = await NotificationPreferencesModel.updateOne(
          {
            orgId: s.orgId,
            userId: member.userId,
            $or: [
              { digestLastSentAt: null },
              { digestLastSentAt: { $lt: new Date(now.getTime() - 20 * 3_600_000) } },
            ],
          },
          { $set: { digestLastSentAt: now } },
        );
        if (claimed.modifiedCount === 0) continue;
        await sendDigestEmail(String(user.email), props);
        result.sent += 1;
      } catch (error) {
        console.error("[digest] could not send a digest", error);
      }
    }
  }
  return result;
}
