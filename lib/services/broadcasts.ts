import "server-only";

import { Types } from "mongoose";

import type { OrgContext } from "@/lib/dal";
import { decryptSecret } from "@/lib/crypto/envelope";
import { connectDb } from "@/lib/db/connect";
import { BroadcastModel, type BroadcastDoc } from "@/lib/db/models/broadcasts";
import { ConnectionModel } from "@/lib/db/models/connections";
import { ContactModel } from "@/lib/db/models/contacts";
import { DomainModel } from "@/lib/db/models/domains";
import { EmailModel } from "@/lib/db/models/emails";
import { SegmentModel } from "@/lib/db/models/segments";
import { SenderModel } from "@/lib/db/models/senders";
import { TemplateModel } from "@/lib/db/models/templates";
import { TopicModel } from "@/lib/db/models/topics";
import { withTransaction } from "@/lib/db/transaction";
import type {
  BroadcastAudienceDTO,
  BroadcastDTO,
  BroadcastFormOptionsDTO,
  BroadcastRowDTO,
  BroadcastStatsDTO,
  BroadcastStatus,
} from "@/lib/dto/audience";
import { enqueueBroadcastSend } from "@/lib/jobs/send";
import { formatAddress } from "@/lib/mail/address";
import { publish } from "@/lib/realtime/publish";
import { getResendAdapter } from "@/lib/resend/client-factory";
import type { ResendAdapter } from "@/lib/resend/adapter";
import { isResendError } from "@/lib/resend/errors";
import {
  createBroadcastInput,
  sendBroadcastInput,
  sendBroadcastTestInput,
  updateBroadcastInput,
} from "@/lib/validation/audience";
import { writeAuditLog } from "./audit";
import {
  authorize,
  isNotFoundInResend,
  listConnectionOptions,
  loadConnection,
  orgOid,
  parseInput,
  remote,
  scopeFilter,
  toObjectId,
  type AudienceDeps,
} from "./audience-shared";
import { ServiceError } from "./errors";
import { canSeeProject } from "./project-scope";
import { connectionNames } from "./segments";
import { assertSendable } from "./sending";
import { keyAad } from "./webhook-secret";

const actor = (ctx: OrgContext) => ({ type: "user" as const, id: new Types.ObjectId(ctx.user.id) });
const versionOf = (doc: unknown) => (doc as { __v?: number }).__v ?? 0;
const staleError = () =>
  new ServiceError(
    "conflict",
    "This broadcast was changed by someone else. Reload to see the latest.",
  );

/* ------------------------------------------------------------------------------------------ */
/* Status                                                                                      */
/* ------------------------------------------------------------------------------------------ */

const REMOTE_STATUS: Record<string, BroadcastStatus> = {
  draft: "draft",
  scheduled: "scheduled",
  queued: "queued",
  sending: "sending",
  sent: "sent",
  canceled: "canceled",
  cancelled: "canceled",
  failed: "failed",
};

/** Resend's status as ours; a queued broadcast with a future time is a scheduled one. */
export function mapBroadcastStatus(status: string, scheduledAt: Date | null): BroadcastStatus {
  const mapped = REMOTE_STATUS[status] ?? "draft";
  return mapped === "queued" && scheduledAt && scheduledAt.getTime() > Date.now()
    ? "scheduled"
    : mapped;
}

/** Statuses that Resend lets us delete (everything else is only removed from Wisemail). */
export const DELETABLE_IN_RESEND: readonly BroadcastStatus[] = ["draft", "scheduled", "canceled"];
export const FINAL_STATUSES: readonly BroadcastStatus[] = ["sent", "failed", "canceled"];

/* ------------------------------------------------------------------------------------------ */
/* Stats and DTOs                                                                              */
/* ------------------------------------------------------------------------------------------ */

const EMPTY_STATS: BroadcastStatsDTO = {
  recipients: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  complained: 0,
};

/** Per-broadcast counters from the emails our webhooks created (`emails.broadcastId`). */
export async function broadcastStats(
  orgId: Types.ObjectId,
  ids: Types.ObjectId[],
): Promise<Map<string, BroadcastStatsDTO>> {
  if (ids.length === 0) return new Map();
  const has = (field: string) => ({
    $cond: [{ $ne: [{ $ifNull: [`$${field}`, null] }, null] }, 1, 0],
  });
  const rows = await EmailModel.aggregate<{ _id: Types.ObjectId } & BroadcastStatsDTO>([
    { $match: { orgId, broadcastId: { $in: ids } } },
    {
      $group: {
        _id: "$broadcastId",
        recipients: { $sum: 1 },
        delivered: { $sum: has("deliveredAt") },
        opened: { $sum: { $cond: [{ $gt: ["$openCount", 0] }, 1, 0] } },
        clicked: { $sum: { $cond: [{ $gt: ["$clickCount", 0] }, 1, 0] } },
        bounced: { $sum: has("bouncedAt") },
        complained: { $sum: has("complainedAt") },
      },
    },
  ]);
  return new Map(rows.map(({ _id, ...stats }) => [_id.toHexString(), stats]));
}

type Names = {
  connection: Map<string, string>;
  segment: Map<string, string>;
  topic: Map<string, string>;
};

async function namesFor(orgId: Types.ObjectId, docs: BroadcastDoc[]): Promise<Names> {
  const ids = (pick: (d: BroadcastDoc) => Types.ObjectId | null | undefined) =>
    [
      ...new Set(
        docs
          .map(pick)
          .filter((x): x is Types.ObjectId => !!x)
          .map((x) => x.toHexString()),
      ),
    ].map((x) => new Types.ObjectId(x));
  const [connection, segments, topics] = await Promise.all([
    connectionNames(
      orgId,
      ids((d) => d.connectionId),
    ),
    SegmentModel.find({ orgId, _id: { $in: ids((d) => d.segmentId) } }, { name: 1 }).lean(),
    TopicModel.find({ orgId, _id: { $in: ids((d) => d.topicId) } }, { name: 1 }).lean(),
  ]);
  return {
    connection,
    segment: new Map(segments.map((s) => [s._id.toHexString(), s.name])),
    topic: new Map(topics.map((t) => [t._id.toHexString(), t.name])),
  };
}

function toRow(
  doc: BroadcastDoc,
  names: Names,
  stats: Map<string, BroadcastStatsDTO>,
): BroadcastRowDTO {
  const status = doc.status as BroadcastStatus;
  return {
    id: doc._id.toHexString(),
    connectionId: doc.connectionId.toHexString(),
    connectionName: names.connection.get(doc.connectionId.toHexString()) ?? "",
    name: doc.name || doc.subject || "Untitled broadcast",
    subject: doc.subject ?? "",
    status,
    segmentId: doc.segmentId?.toHexString() ?? null,
    segmentName: doc.segmentId ? (names.segment.get(doc.segmentId.toHexString()) ?? null) : null,
    scheduledAt: doc.scheduledAt?.toISOString() ?? null,
    sentAt: doc.sentAt?.toISOString() ?? null,
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt.toISOString(),
    stats: status === "draft" ? null : (stats.get(doc._id.toHexString()) ?? EMPTY_STATS),
  };
}

export const UNSUBSCRIBE_WARNING =
  "No unsubscribe link. Add {{{RESEND_UNSUBSCRIBE_URL}}} to the message so people can opt out.";

export function broadcastWarnings(input: {
  html: string;
  segmentId: unknown;
  senderProblem?: string | null;
}): string[] {
  const warnings: string[] = [];
  if (!input.segmentId) warnings.push("This broadcast has no segment. Pick one before sending.");
  if (input.html && !/RESEND_UNSUBSCRIBE_URL|unsubscribe/i.test(input.html))
    warnings.push(UNSUBSCRIBE_WARNING);
  if (input.senderProblem) warnings.push(input.senderProblem);
  return warnings;
}

/* ------------------------------------------------------------------------------------------ */
/* Reads                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export async function listBroadcasts(
  ctx: OrgContext,
  input: { connectionId?: string; status?: BroadcastStatus } = {},
): Promise<BroadcastRowDTO[]> {
  authorize(ctx, "broadcast:read");
  await connectDb();
  const filter = await scopeFilter(ctx, input.connectionId);
  const docs = await BroadcastModel.find({
    ...filter,
    ...(input.status ? { status: input.status } : {}),
  })
    .sort({ createdAt: -1 })
    .limit(200);
  const [names, stats] = await Promise.all([
    namesFor(filter.orgId, docs),
    broadcastStats(
      filter.orgId,
      docs.filter((d) => d.status !== "draft").map((d) => d._id),
    ),
  ]);
  return docs.map((d) => toRow(d, names, stats));
}

async function loadBroadcast(ctx: OrgContext, id: string) {
  const oid = toObjectId(id, "Broadcast");
  const filter = await scopeFilter(ctx);
  const doc = await BroadcastModel.findOne({ ...filter, _id: oid });
  if (!doc) throw new ServiceError("not_found", "Broadcast not found.");
  return doc;
}

async function senderProblem(orgId: Types.ObjectId, doc: BroadcastDoc): Promise<string | null> {
  if (!doc.senderId) return null;
  const ctxs = await loadSenderContext(orgId, doc.senderId);
  if (!ctxs) return "The sender for this broadcast was deleted. Pick another one.";
  try {
    assertSendable(ctxs);
    return null;
  } catch (error) {
    return error instanceof ServiceError ? error.message : null;
  }
}

async function loadSenderContext(orgId: Types.ObjectId, senderId: Types.ObjectId) {
  const sender = await SenderModel.findOne({ _id: senderId, orgId, deletedAt: null }).lean();
  if (!sender) return null;
  const domain = await DomainModel.findOne({ _id: sender.domainId, orgId }).lean();
  const connection = domain
    ? await ConnectionModel.findOne({ _id: domain.connectionId, orgId, deletedAt: null }).lean()
    : null;
  return { sender, domain, connection };
}

async function toDetail(doc: BroadcastDoc): Promise<BroadcastDTO> {
  const [names, stats, connection, problem] = await Promise.all([
    namesFor(doc.orgId, [doc]),
    broadcastStats(doc.orgId, [doc._id]),
    ConnectionModel.findOne({ _id: doc.connectionId, orgId: doc.orgId }, { status: 1 }).lean(),
    senderProblem(doc.orgId, doc),
  ]);
  const html = doc.html ?? "";
  return {
    ...toRow(doc, names, stats),
    from: doc.from ?? "",
    senderId: doc.senderId?.toHexString() ?? null,
    topicId: doc.topicId?.toHexString() ?? null,
    topicName: doc.topicId ? (names.topic.get(doc.topicId.toHexString()) ?? null) : null,
    previewText: doc.previewText ?? "",
    html,
    text: doc.text ?? "",
    templateId: doc.templateId?.toHexString() ?? null,
    version: versionOf(doc),
    warnings:
      doc.status === "draft"
        ? broadcastWarnings({ html, segmentId: doc.segmentId, senderProblem: problem })
        : [],
    writable: connection?.status === "active",
  };
}

export async function getBroadcast(ctx: OrgContext, id: string): Promise<BroadcastDTO> {
  authorize(ctx, "broadcast:read");
  await connectDb();
  return toDetail(await loadBroadcast(ctx, id));
}

/**
 * Who a send would reach among the contacts we mirror: members of the segment who have not
 * unsubscribed and, when the broadcast has a topic, have not opted out of it.
 */
export async function audienceFor(
  orgId: Types.ObjectId,
  doc: Pick<BroadcastDoc, "segmentId" | "topicId">,
): Promise<BroadcastAudienceDTO> {
  if (!doc.segmentId) {
    return {
      segmentId: null,
      segmentName: null,
      recipients: 0,
      inSegment: 0,
      unsubscribed: 0,
      optedOutOfTopic: 0,
    };
  }
  const [segment, topic] = await Promise.all([
    SegmentModel.findOne({ _id: doc.segmentId, orgId }, { name: 1 }).lean(),
    doc.topicId
      ? TopicModel.findOne({ _id: doc.topicId, orgId }, { defaultSubscription: 1 }).lean()
      : null,
  ]);
  const inSegmentFilter = { orgId, segmentIds: doc.segmentId };
  const base = { ...inSegmentFilter, unsubscribed: { $ne: true } };
  const sub = (subscription: "opt_in" | "opt_out") => ({
    topicSubscriptions: { $elemMatch: { topicId: doc.topicId, subscription } },
  });
  const [inSegment, unsubscribed, baseCount] = await Promise.all([
    ContactModel.countDocuments(inSegmentFilter),
    ContactModel.countDocuments({ ...inSegmentFilter, unsubscribed: true }),
    ContactModel.countDocuments(base),
  ]);
  // With a topic, a contact who has not chosen follows the topic's default.
  let recipients = baseCount;
  if (topic) {
    recipients =
      topic.defaultSubscription === "opt_out"
        ? await ContactModel.countDocuments({ ...base, ...sub("opt_in") })
        : baseCount - (await ContactModel.countDocuments({ ...base, ...sub("opt_out") }));
  }
  const optedOut = baseCount - recipients;
  return {
    segmentId: doc.segmentId.toHexString(),
    segmentName: segment?.name ?? null,
    recipients,
    inSegment,
    unsubscribed,
    optedOutOfTopic: optedOut,
  };
}

export async function getBroadcastAudience(
  ctx: OrgContext,
  id: string,
): Promise<BroadcastAudienceDTO> {
  authorize(ctx, "broadcast:read");
  await connectDb();
  const doc = await loadBroadcast(ctx, id);
  return audienceFor(doc.orgId, doc);
}

/** Choices for the editor: connections, segments, topics, usable senders and published templates. */
export async function getBroadcastFormOptions(ctx: OrgContext): Promise<BroadcastFormOptionsDTO> {
  authorize(ctx, "broadcast:read");
  await connectDb();
  const filter = await scopeFilter(ctx);
  const orgId = filter.orgId;
  const [connections, segments, topics, templates, senders, domains] = await Promise.all([
    listConnectionOptions(ctx),
    SegmentModel.find(filter).sort({ name: 1 }).lean(),
    TopicModel.find(filter).sort({ name: 1 }).lean(),
    TemplateModel.find({ ...filter, status: "published" }).sort({ name: 1 }),
    SenderModel.find({ orgId, deletedAt: null }).sort({ address: 1 }).lean(),
    DomainModel.find({ orgId }, { connectionId: 1, projectId: 1, status: 1, name: 1 }).lean(),
  ]);
  const domainById = new Map(domains.map((d) => [d._id.toHexString(), d]));
  const visible = new Set(connections.map((c) => c.id));
  return {
    connections,
    segments: segments.map((s) => ({
      id: s._id.toHexString(),
      name: s.name,
      connectionId: s.connectionId.toHexString(),
      contactCount: s.contactCount ?? 0,
    })),
    topics: topics.map((t) => ({
      id: t._id.toHexString(),
      name: t.name,
      connectionId: t.connectionId.toHexString(),
    })),
    senders: senders.flatMap((s) => {
      const domain = domainById.get(s.domainId.toHexString());
      if (!domain || !visible.has(domain.connectionId.toHexString())) return [];
      if (!canSeeProject(ctx, domain.projectId?.toHexString() ?? null)) return [];
      return [
        {
          id: s._id.toHexString(),
          connectionId: domain.connectionId.toHexString(),
          address: s.address,
          displayName: s.displayName ?? "",
          problem: s.status === "active" ? null : `${s.address} can't send right now.`,
        },
      ];
    }),
    templates: templates.map((d) => ({
      id: d._id.toHexString(),
      connectionId: d.connectionId.toHexString(),
      name: d.name,
      subject: d.subject ?? "",
      html: d.html ?? "",
      variables: (d.variables ?? []).map((v) => ({
        key: v.key,
        type: v.type === "number" ? ("number" as const) : ("string" as const),
        fallback: (v.fallback ?? null) as string | number | null,
      })),
    })),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Draft writes                                                                                */
/* ------------------------------------------------------------------------------------------ */

type DraftFields = {
  name: string;
  segmentId: string;
  senderId: string;
  subject: string;
  previewText: string;
  topicId: string | null;
  html: string;
  templateId: string | null;
};

/** Resolves and checks every reference of a draft against the connection; returns what Resend needs. */
async function resolveDraft(ctx: OrgContext, connectionId: Types.ObjectId, f: DraftFields) {
  const orgId = orgOid(ctx);
  const [segment, topic, template, sender] = await Promise.all([
    SegmentModel.findOne({ _id: toObjectId(f.segmentId, "Segment"), orgId, connectionId }).lean(),
    f.topicId
      ? TopicModel.findOne({ _id: toObjectId(f.topicId, "Topic"), orgId, connectionId }).lean()
      : null,
    f.templateId
      ? TemplateModel.findOne(
          { _id: toObjectId(f.templateId, "Template"), orgId, connectionId },
          { _id: 1 },
        ).lean()
      : null,
    loadSenderContext(orgId, toObjectId(f.senderId, "Sender")),
  ]);
  if (!segment)
    throw new ServiceError("validation", "Pick a segment from this account.", {
      segmentId: ["Pick a segment from this account."],
    });
  if (f.topicId && !topic)
    throw new ServiceError("validation", "That topic isn't on this account.", {
      topicId: ["That topic isn't on this account."],
    });
  if (f.templateId && !template)
    throw new ServiceError("validation", "That template isn't on this account.", {
      templateId: ["Template not found."],
    });
  if (
    !sender ||
    !sender.domain ||
    !sender.domain.connectionId.equals(connectionId) ||
    !canSeeProject(ctx, sender.domain.projectId?.toHexString() ?? null)
  ) {
    throw new ServiceError("validation", "Pick a sender from this account.", {
      senderId: ["Pick a sender from this account."],
    });
  }
  assertSendable(sender);
  return {
    segment,
    topic,
    sender: sender.sender,
    from: formatAddress({ address: sender.sender.address, name: sender.sender.displayName }),
  };
}

export async function createBroadcast(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<BroadcastDTO> {
  authorize(ctx, "broadcast:create");
  const input = parseInput(createBroadcastInput, raw);
  const { connection, adapter } = await loadConnection(ctx, input.connectionId, "write", deps);
  const orgId = orgOid(ctx);
  const resolved = await resolveDraft(ctx, connection._id, input);

  const created = await remote(() =>
    adapter.createBroadcast({
      name: input.name,
      segmentId: resolved.segment.resendId,
      from: resolved.from,
      subject: input.subject,
      previewText: input.previewText || undefined,
      topicId: resolved.topic?.resendId ?? null,
      html: input.html,
      replyTo: resolved.sender.replyTo?.length ? resolved.sender.replyTo : undefined,
    }),
  );

  const doc = await withTransaction(async (session) => {
    const doc = await BroadcastModel.findOneAndUpdate(
      { orgId, connectionId: connection._id, resendId: created.id },
      {
        $set: {
          name: input.name,
          segmentId: resolved.segment._id,
          topicId: resolved.topic?._id ?? null,
          senderId: resolved.sender._id,
          from: resolved.from,
          subject: input.subject,
          previewText: input.previewText || undefined,
          html: input.html,
          templateId: input.templateId ? new Types.ObjectId(input.templateId) : null,
          status: "draft",
          scheduledAt: null,
          sentAt: null,
          resendCreatedAt: new Date(),
          createdBy: new Types.ObjectId(ctx.user.id),
        },
      },
      { upsert: true, returnDocument: "after", session },
    );
    await writeAuditLog(
      {
        orgId,
        actor: actor(ctx),
        action: "broadcast.created",
        target: { type: "broadcast", id: doc._id },
        changes: { after: { name: input.name, subject: input.subject } },
      },
      { session },
    );
    await publish(
      { orgId, topics: ["broadcasts", `broadcast:${doc._id.toHexString()}`] },
      { session },
    );
    return doc;
  });
  return toDetail(doc);
}

export async function updateBroadcast(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<BroadcastDTO> {
  authorize(ctx, "broadcast:create");
  const input = parseInput(updateBroadcastInput, raw);
  const current = await loadBroadcast(ctx, input.id);
  if (current.status !== "draft") {
    throw new ServiceError(
      "conflict",
      "Only drafts can be edited. This broadcast was already sent or scheduled.",
    );
  }
  if (versionOf(current) !== input.version) throw staleError();
  const { adapter } = await loadConnection(ctx, current.connectionId, "write", deps);
  const resolved = await resolveDraft(ctx, current.connectionId, input);
  if (!current.resendId)
    throw new ServiceError("conflict", "This draft isn't in Resend yet. Create a new one.");

  await remote(() =>
    adapter.updateBroadcast(current.resendId!, {
      name: input.name,
      segmentId: resolved.segment.resendId,
      from: resolved.from,
      subject: input.subject,
      previewText: input.previewText,
      topicId: resolved.topic?.resendId ?? null,
      html: input.html,
      replyTo: resolved.sender.replyTo ?? [],
    }),
  );

  try {
    const doc = await withTransaction(async (session) => {
      const fresh = await BroadcastModel.findOne({ _id: current._id, orgId: current.orgId }, null, {
        session,
      });
      if (!fresh || versionOf(fresh) !== input.version) throw staleError();
      fresh.set({
        name: input.name,
        segmentId: resolved.segment._id,
        topicId: resolved.topic?._id ?? null,
        senderId: resolved.sender._id,
        from: resolved.from,
        subject: input.subject,
        previewText: input.previewText || undefined,
        html: input.html,
        templateId: input.templateId ? new Types.ObjectId(input.templateId) : null,
      });
      await fresh.save({ session });
      await writeAuditLog(
        {
          orgId: fresh.orgId,
          actor: actor(ctx),
          action: "broadcast.updated",
          target: { type: "broadcast", id: fresh._id },
          changes: { after: { name: input.name, subject: input.subject } },
        },
        { session },
      );
      await publish(
        { orgId: fresh.orgId, topics: ["broadcasts", `broadcast:${fresh._id.toHexString()}`] },
        { session },
      );
      return fresh;
    });
    return toDetail(doc);
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") throw staleError();
    throw error;
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Send, schedule, cancel                                                                      */
/* ------------------------------------------------------------------------------------------ */

async function mirrorRemoteState(
  adapter: ResendAdapter,
  doc: BroadcastDoc,
  fallback: { status: BroadcastStatus; scheduledAt: Date | null },
) {
  try {
    const remoteState = await adapter.getBroadcast(doc.resendId!);
    const scheduledAt = remoteState.scheduledAt ? new Date(remoteState.scheduledAt) : null;
    return {
      status: mapBroadcastStatus(remoteState.status, scheduledAt),
      scheduledAt,
      sentAt: remoteState.sentAt ? new Date(remoteState.sentAt) : null,
    };
  } catch {
    return { ...fallback, sentAt: null };
  }
}

export async function sendBroadcast(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<BroadcastDTO> {
  authorize(ctx, "broadcast:send");
  const input = parseInput(sendBroadcastInput, raw);
  const doc = await loadBroadcast(ctx, input.id);
  if (doc.status !== "draft")
    throw new ServiceError("conflict", "This broadcast was already sent or scheduled.");
  if (!doc.resendId) throw new ServiceError("conflict", "This draft isn't in Resend yet.");
  if (!doc.segmentId) throw new ServiceError("segment_missing", "Pick a segment before sending.");
  if (!doc.senderId) throw new ServiceError("sender_inactive", "Pick a sender before sending.");
  if (!doc.subject?.trim() || !doc.html?.trim())
    throw new ServiceError("validation", "Add a subject and a message before sending.");
  if (input.scheduledAt && input.scheduledAt.getTime() <= Date.now() + 30_000) {
    throw new ServiceError("validation", "Pick a time in the future.", {
      scheduledAt: ["Pick a time in the future"],
    });
  }
  const { adapter } = await loadConnection(ctx, doc.connectionId, "write", deps);
  const sender = await loadSenderContext(doc.orgId, doc.senderId);
  if (!sender)
    throw new ServiceError(
      "sender_inactive",
      "The sender for this broadcast was deleted. Pick another one.",
    );
  assertSendable(sender);

  const audience = await audienceFor(doc.orgId, doc);
  if (audience.recipients === 0) {
    throw new ServiceError(
      "segment_empty",
      audience.inSegment === 0
        ? "This segment has no contacts yet, so there is nobody to send to."
        : "Everyone in this segment has unsubscribed or opted out, so there is nobody to send to.",
    );
  }

  await remote(() =>
    adapter.sendBroadcast(
      doc.resendId!,
      input.scheduledAt ? { scheduledAt: input.scheduledAt.toISOString() } : {},
    ),
  );

  const state = await mirrorRemoteState(adapter, doc, {
    status: input.scheduledAt ? "scheduled" : "queued",
    scheduledAt: input.scheduledAt ?? null,
  });
  const updated = await withTransaction(async (session) => {
    const fresh = await BroadcastModel.findOneAndUpdate(
      { _id: doc._id, orgId: doc.orgId },
      { $set: { status: state.status, scheduledAt: state.scheduledAt, sentAt: state.sentAt } },
      { returnDocument: "after", session },
    );
    await writeAuditLog(
      {
        orgId: doc.orgId,
        actor: actor(ctx),
        action: input.scheduledAt ? "broadcast.scheduled" : "broadcast.sent",
        target: { type: "broadcast", id: doc._id },
        changes: {
          after: {
            name: doc.name ?? null,
            recipients: audience.recipients,
            segment: audience.segmentName,
            scheduledAt: input.scheduledAt?.toISOString() ?? null,
          },
        },
      },
      { session },
    );
    await publish(
      { orgId: doc.orgId, topics: ["broadcasts", `broadcast:${doc._id.toHexString()}`, "emails"] },
      { session },
    );
    return fresh!;
  });
  await enqueueBroadcastSend({
    broadcastId: doc._id.toHexString(),
    orgId: doc.orgId.toHexString(),
    connectionId: doc.connectionId.toHexString(),
  }).catch((error) => console.error("[broadcast] could not enqueue follow-up", error));
  return toDetail(updated);
}

/** Cancels in Resend first; the mirror then takes whatever status Resend reports. */
export async function cancelBroadcast(
  ctx: OrgContext,
  id: string,
  deps: AudienceDeps = {},
): Promise<BroadcastDTO> {
  authorize(ctx, "broadcast:send");
  const doc = await loadBroadcast(ctx, id);
  if (doc.status !== "scheduled" || !doc.resendId) {
    throw new ServiceError(
      "conflict",
      "Only scheduled broadcasts can be canceled. This one is no longer scheduled.",
    );
  }
  const { adapter } = await loadConnection(ctx, doc.connectionId, "write", deps);
  try {
    await remote(() => adapter.cancelBroadcast(doc.resendId!));
  } catch (error) {
    if (error instanceof ServiceError && error.code === "resend_rejected") {
      throw new ServiceError(
        "conflict",
        "Resend already started sending this broadcast, so it can't be canceled.",
      );
    }
    throw error;
  }
  const state = await mirrorRemoteState(adapter, doc, { status: "canceled", scheduledAt: null });
  const updated = await withTransaction(async (session) => {
    const fresh = await BroadcastModel.findOneAndUpdate(
      { _id: doc._id, orgId: doc.orgId },
      { $set: { status: state.status, scheduledAt: state.scheduledAt } },
      { returnDocument: "after", session },
    );
    await writeAuditLog(
      {
        orgId: doc.orgId,
        actor: actor(ctx),
        action: "broadcast.canceled",
        target: { type: "broadcast", id: doc._id },
        changes: {
          before: { status: "scheduled", scheduledAt: doc.scheduledAt?.toISOString() ?? null },
          after: { status: state.status },
        },
      },
      { session },
    );
    await publish(
      { orgId: doc.orgId, topics: ["broadcasts", `broadcast:${doc._id.toHexString()}`] },
      { session },
    );
    return fresh!;
  });
  return toDetail(updated);
}

/**
 * Drafts, scheduled and canceled broadcasts are deleted in Resend first. Broadcasts that went
 * out cannot be deleted there, so they are only removed from Wisemail.
 */
export async function deleteBroadcast(
  ctx: OrgContext,
  id: string,
  deps: AudienceDeps = {},
): Promise<{ removedInResend: boolean }> {
  const doc = await loadBroadcast(ctx, id);
  const deletable = DELETABLE_IN_RESEND.includes(doc.status as BroadcastStatus);
  authorize(ctx, deletable && doc.status === "draft" ? "broadcast:create" : "broadcast:send");
  if (deletable && doc.resendId) {
    const { adapter } = await loadConnection(ctx, doc.connectionId, "write", deps);
    try {
      await remote(() => adapter.deleteBroadcast(doc.resendId!));
    } catch (error) {
      if (!isNotFoundInResend(error)) throw error;
    }
  }
  await withTransaction(async (session) => {
    await BroadcastModel.deleteOne({ _id: doc._id, orgId: doc.orgId }, { session });
    await writeAuditLog(
      {
        orgId: doc.orgId,
        actor: actor(ctx),
        action: deletable ? "broadcast.deleted" : "broadcast.removed",
        target: { type: "broadcast", id: doc._id },
        changes: { before: { name: doc.name ?? null, status: doc.status } },
      },
      { session },
    );
    await publish(
      { orgId: doc.orgId, topics: ["broadcasts", `broadcast:${doc._id.toHexString()}`] },
      { session },
    );
  });
  return { removedInResend: deletable && !!doc.resendId };
}

/** Sends the draft as an ordinary email to one address (yours by default) to see it in a real inbox. */
export async function sendBroadcastTest(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<{ to: string }> {
  authorize(ctx, "broadcast:send");
  const input = parseInput(sendBroadcastTestInput, raw);
  const doc = await loadBroadcast(ctx, input.id);
  if (!doc.senderId || !doc.html?.trim() || !doc.subject?.trim()) {
    throw new ServiceError(
      "validation",
      "Add a sender, subject and message before sending a test.",
    );
  }
  const { adapter } = await loadConnection(ctx, doc.connectionId, "write", deps);
  const sender = await loadSenderContext(doc.orgId, doc.senderId);
  if (!sender)
    throw new ServiceError(
      "sender_inactive",
      "The sender for this broadcast was deleted. Pick another one.",
    );
  assertSendable(sender);
  const to = (input.to ?? ctx.user.email).toLowerCase();
  await remote(() =>
    adapter.sendEmail(
      {
        from: formatAddress({ address: sender.sender.address, name: sender.sender.displayName }),
        to: [to],
        subject: `[Test] ${doc.subject}`,
        html: doc.html!,
      },
      { idempotencyKey: `broadcast-test-${doc._id.toHexString()}-${Date.now()}` },
    ),
  );
  await writeAuditLog({
    orgId: doc.orgId,
    actor: actor(ctx),
    action: "broadcast.test_sent",
    target: { type: "broadcast", id: doc._id },
    changes: { after: { to } },
  });
  return { to };
}

/* ------------------------------------------------------------------------------------------ */
/* Status refresh (button, page, `send-broadcast` job)                                         */
/* ------------------------------------------------------------------------------------------ */

async function refreshDoc(doc: BroadcastDoc, adapter: ResendAdapter): Promise<BroadcastDoc> {
  if (!doc.resendId) return doc;
  let state;
  try {
    state = await adapter.getBroadcast(doc.resendId);
  } catch (error) {
    // Gone in Resend (deleted there): keep the mirror; the next sync settles it.
    if (isResendError(error) && error.code === "resend_not_found") return doc;
    throw error;
  }
  const scheduledAt = state.scheduledAt ? new Date(state.scheduledAt) : null;
  const status = mapBroadcastStatus(state.status, scheduledAt);
  const sentAt = state.sentAt ? new Date(state.sentAt) : null;
  const changed =
    status !== doc.status ||
    (scheduledAt?.getTime() ?? null) !== (doc.scheduledAt?.getTime() ?? null) ||
    (sentAt?.getTime() ?? null) !== (doc.sentAt?.getTime() ?? null);
  if (!changed) return doc;
  const fresh = await withTransaction(async (session) => {
    const updated = await BroadcastModel.findOneAndUpdate(
      { _id: doc._id, orgId: doc.orgId },
      { $set: { status, scheduledAt, sentAt } },
      { returnDocument: "after", session },
    );
    await publish(
      { orgId: doc.orgId, topics: ["broadcasts", `broadcast:${doc._id.toHexString()}`] },
      { session },
    );
    return updated!;
  });
  return fresh;
}

export async function refreshBroadcast(
  ctx: OrgContext,
  id: string,
  deps: AudienceDeps = {},
): Promise<BroadcastDTO> {
  authorize(ctx, "broadcast:read");
  const doc = await loadBroadcast(ctx, id);
  if (FINAL_STATUSES.includes(doc.status as BroadcastStatus) && doc.status !== "canceled")
    return toDetail(doc);
  const { adapter } = await loadConnection(ctx, doc.connectionId, "read", deps);
  return toDetail(await refreshDoc(doc, adapter));
}

/** For the job: no member context. Returns the status after reading Resend. */
export async function refreshBroadcastStatus(
  broadcastId: string,
  deps: AudienceDeps = {},
): Promise<{ status: BroadcastStatus | "missing"; scheduledAt: string | null }> {
  await connectDb();
  const oid = toObjectId(broadcastId, "Broadcast");
  const doc = await BroadcastModel.findById(oid);
  if (!doc) return { status: "missing", scheduledAt: null };
  const connection = await ConnectionModel.findOne({
    _id: doc.connectionId,
    orgId: doc.orgId,
    deletedAt: null,
  });
  if (!connection?.apiKey)
    return {
      status: doc.status as BroadcastStatus,
      scheduledAt: doc.scheduledAt?.toISOString() ?? null,
    };
  const adapter =
    deps.adapter ??
    getResendAdapter(decryptSecret(connection.apiKey, { aad: keyAad(connection._id) }));
  const fresh = await refreshDoc(doc, adapter);
  return {
    status: fresh.status as BroadcastStatus,
    scheduledAt: fresh.scheduledAt?.toISOString() ?? null,
  };
}
