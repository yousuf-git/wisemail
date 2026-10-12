import "server-only";

import { Types, type ClientSession } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { DeletionTombstoneModel } from "@/lib/db/models/deletion-tombstones";
import { EmailModel, TRASH_RETENTION_DAYS } from "@/lib/db/models/emails";
import { ThreadMemberStateModel } from "@/lib/db/models/thread-member-states";
import { ThreadModel } from "@/lib/db/models/threads";
import { withTransaction } from "@/lib/db/transaction";
import {
  normalizeSubject,
  resolveThread,
  subjectKey,
  type ThreadDecision,
} from "@/lib/mail/thread";
import { publish } from "@/lib/realtime/publish";
import { ServiceError } from "./errors";
import { projectFilter } from "./project-scope";

/* ------------------------------------------------------------------------------------------ */
/* Threading and cache maintenance (used by fetch-inbound and sending)                         */
/* ------------------------------------------------------------------------------------------ */

export type ThreadMessage = {
  orgId: Types.ObjectId;
  connectionId: Types.ObjectId;
  domainId: Types.ObjectId | null;
  projectId: Types.ObjectId | null;
  direction: "inbound" | "outbound";
  /** Our address the conversation is with. */
  mailboxAddress: string;
  subject: string;
  /** External addresses of this message. */
  participants: string[];
  at: Date;
  snippet: string;
  hasAttachments: boolean;
  inReplyTo?: string | null;
  references?: string[];
};

/** Decides which thread a message belongs to (TRD §2.4 step 5). */
export async function decideThread(
  message: ThreadMessage,
  options: { session?: ClientSession } = {},
): Promise<ThreadDecision> {
  const { session } = options;
  return resolveThread(
    {
      inReplyTo: message.inReplyTo,
      references: message.references,
      subject: message.subject,
      participants: message.participants,
      mailboxAddress: message.mailboxAddress,
      at: message.at,
    },
    {
      async threadsByMessageId(ids) {
        const emails = await EmailModel.find(
          { orgId: message.orgId, messageId: { $in: ids }, threadId: { $ne: null } },
          { messageId: 1, threadId: 1 },
          { session },
        ).lean();
        return new Map(emails.map((e) => [e.messageId!, e.threadId!.toHexString()]));
      },
      async tombstonedHashes(hashes) {
        const found = await DeletionTombstoneModel.find(
          { orgId: message.orgId, messageIdHash: { $in: hashes } },
          { messageIdHash: 1 },
          { session },
        ).lean();
        return new Set(found.map((t) => t.messageIdHash!));
      },
      async threadsBySubject(key) {
        const threads = await ThreadModel.find(
          { orgId: message.orgId, subjectKey: key, trashedAt: null },
          { subjectKey: 1, participants: 1, mailboxAddress: 1, lastMessageAt: 1 },
          { session },
        )
          .sort({ lastMessageAt: -1, _id: -1 })
          .limit(25)
          .lean();
        return threads.map((t) => ({
          threadId: t._id.toHexString(),
          subjectKey: t.subjectKey,
          participants: t.participants,
          mailboxAddress: t.mailboxAddress,
          lastMessageAt: t.lastMessageAt,
        }));
      },
    },
  );
}

/**
 * Adds a message to its thread and updates the thread's cached fields (count, last message,
 * snippet, participants, last inbound/outbound). `threadId` skips resolution (our own replies
 * already know their thread). A new inbound message restores a trashed or archived thread.
 * Runs inside the caller's transaction.
 */
export async function attachMessageToThread(
  message: ThreadMessage,
  options: { session: ClientSession; threadId?: Types.ObjectId | null },
): Promise<{ threadId: Types.ObjectId; created: boolean; via: string }> {
  const { session } = options;
  let threadId = options.threadId ?? null;
  let via = "given";
  if (threadId) {
    const exists = await ThreadModel.exists({ _id: threadId, orgId: message.orgId }).session(
      session,
    );
    if (!exists) threadId = null;
  }
  if (!threadId) {
    const decision = await decideThread(message, { session });
    if (decision.kind === "existing") {
      threadId = new Types.ObjectId(decision.threadId);
      via = decision.via;
    } else {
      via = decision.reason;
    }
  }

  const inbound = message.direction === "inbound";
  if (!threadId) {
    const [created] = await ThreadModel.create(
      [
        {
          orgId: message.orgId,
          connectionId: message.connectionId,
          domainId: message.domainId,
          projectId: message.projectId,
          mailboxAddress: message.mailboxAddress,
          subject: normalizeSubject(message.subject),
          subjectKey: subjectKey(message.subject),
          participants: message.participants,
          messageCount: 1,
          lastMessageAt: message.at,
          ...(inbound ? { lastInboundAt: message.at } : { lastOutboundAt: message.at }),
          snippet: message.snippet,
          hasAttachments: message.hasAttachments,
        },
      ],
      { session },
    );
    return { threadId: created!._id, created: true, via };
  }

  const current = await ThreadModel.findOne({ _id: threadId, orgId: message.orgId }, null, {
    session,
  }).lean();
  const newest = !current || message.at.getTime() >= current.lastMessageAt.getTime();
  await ThreadModel.updateOne(
    { _id: threadId, orgId: message.orgId },
    {
      $inc: { messageCount: 1 },
      $max: {
        lastMessageAt: message.at,
        ...(inbound ? { lastInboundAt: message.at } : { lastOutboundAt: message.at }),
      },
      $addToSet: { participants: { $each: message.participants } },
      $set: {
        ...(newest ? { snippet: message.snippet } : {}),
        ...(message.hasAttachments ? { hasAttachments: true } : {}),
        ...(inbound ? { trashedAt: null, trashedBy: null, purgeAt: null, archived: false } : {}),
      },
    },
    { session },
  );
  return { threadId, created: false, via };
}

/** Rebuilds a thread's cached counters from its live (non-trashed) emails, e.g. after Trash. */
export async function recomputeThreadCache(
  orgId: Types.ObjectId,
  threadId: Types.ObjectId,
  options: { session?: ClientSession } = {},
): Promise<void> {
  const emails = await EmailModel.find(
    { orgId, threadId, trashedAt: null, status: { $ne: "canceled" } },
    {
      direction: 1,
      snippet: 1,
      hasAttachments: 1,
      receivedAt: 1,
      sentAt: 1,
      createdAt: 1,
    },
    { session: options.session },
  ).lean();
  const at = (e: (typeof emails)[number]) => e.receivedAt ?? e.sentAt ?? e.createdAt;
  const sorted = [...emails].sort((a, b) => at(a).getTime() - at(b).getTime());
  const last = sorted.at(-1);
  const lastOf = (direction: "inbound" | "outbound") =>
    sorted
      .filter((e) => e.direction === direction)
      .map(at)
      .at(-1);
  await ThreadModel.updateOne(
    { _id: threadId, orgId },
    {
      $set: {
        messageCount: emails.length,
        hasAttachments: emails.some((e) => e.hasAttachments),
        ...(last ? { lastMessageAt: at(last), snippet: last.snippet } : {}),
        ...(lastOf("inbound") ? { lastInboundAt: lastOf("inbound") } : {}),
        ...(lastOf("outbound") ? { lastOutboundAt: lastOf("outbound") } : {}),
      },
      $unset: {
        ...(lastOf("inbound") ? {} : { lastInboundAt: 1 }),
        ...(lastOf("outbound") ? {} : { lastOutboundAt: 1 }),
      },
    },
    { session: options.session },
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Read state (per member)                                                                     */
/* ------------------------------------------------------------------------------------------ */

const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);
const userOid = (ctx: OrgContext) => new Types.ObjectId(ctx.user.id);

async function visibleThread(ctx: OrgContext, threadId: string) {
  if (!Types.ObjectId.isValid(threadId)) throw new ServiceError("not_found", "Thread not found.");
  const thread = await ThreadModel.findOne(
    { _id: threadId, orgId: orgOid(ctx), ...projectFilter(ctx) },
    { projectId: 1 },
  ).lean();
  if (!thread) throw new ServiceError("not_found", "Thread not found.");
  return thread;
}

async function setRead(ctx: OrgContext, threadId: string, read: boolean) {
  authorize(ctx, "thread:read");
  await connectDb();
  const thread = await visibleThread(ctx, threadId);
  // Unread is "no state or lastReadAt older than the last inbound message": epoch means unread.
  const lastReadAt = read ? new Date() : new Date(0);
  await ThreadMemberStateModel.updateOne(
    { threadId: thread._id, userId: userOid(ctx) },
    { $set: { lastReadAt }, $setOnInsert: { orgId: orgOid(ctx) } },
    { upsert: true },
  );
  await publish({
    orgId: orgOid(ctx),
    projectId: thread.projectId ?? null,
    userId: userOid(ctx),
    topics: ["threads", `thread:${threadId}`],
    patch: { unread: !read },
  });
  return { threadId, unread: !read };
}

/** Marks a thread read for the calling member only. */
export const markThreadRead = (ctx: OrgContext, threadId: string) => setRead(ctx, threadId, true);
/** Marks a thread unread for the calling member only. */
export const markThreadUnread = (ctx: OrgContext, threadId: string) =>
  setRead(ctx, threadId, false);

/* ------------------------------------------------------------------------------------------ */
/* Trash and restore (TRD §2.14). Permanent delete + tombstones arrive with Phase 7.           */
/* ------------------------------------------------------------------------------------------ */

const ids = (values: string[] | undefined) =>
  (values ?? []).filter((v) => /^[0-9a-f]{24}$/i.test(v)).map((v) => new Types.ObjectId(v));

export type TrashInput = { threadIds?: string[]; emailIds?: string[] };

/**
 * Moves whole threads (with their emails) and/or single emails to Trash: sets `trashedAt`,
 * `trashedBy`, `purgeAt = now + 30 days`, recomputes affected thread counters, publishes.
 * Only items the member may see are touched; others are ignored.
 * TODO(phase 7): permanent delete writes `deletion_tombstones` (see `hashMessageId`) and
 * removes contents, attachments and R2 objects.
 */
export async function trashItems(ctx: OrgContext, input: TrashInput) {
  if (input.threadIds?.length) authorize(ctx, "thread:trash");
  if (input.emailIds?.length) authorize(ctx, "email:trash");
  await connectDb();
  const orgId = orgOid(ctx);
  const now = new Date();
  const fields = {
    trashedAt: now,
    trashedBy: userOid(ctx),
    purgeAt: new Date(now.getTime() + TRASH_RETENTION_DAYS * 86_400_000),
  };
  return withTransaction(async (session) => {
    const threads = await ThreadModel.find(
      { _id: { $in: ids(input.threadIds) }, orgId, trashedAt: null, ...projectFilter(ctx) },
      { projectId: 1 },
      { session },
    ).lean();
    const threadIds = threads.map((t) => t._id);
    await ThreadModel.updateMany({ _id: { $in: threadIds }, orgId }, { $set: fields }, { session });
    await EmailModel.updateMany(
      { orgId, threadId: { $in: threadIds }, trashedAt: null },
      { $set: fields },
      { session },
    );

    const emails = await EmailModel.find(
      { _id: { $in: ids(input.emailIds) }, orgId, trashedAt: null, ...projectFilter(ctx) },
      { threadId: 1, projectId: 1 },
      { session },
    ).lean();
    await EmailModel.updateMany(
      { _id: { $in: emails.map((e) => e._id) }, orgId },
      { $set: fields },
      { session },
    );
    const touched = new Map(
      emails.filter((e) => e.threadId).map((e) => [e.threadId!.toHexString(), e.threadId!]),
    );
    for (const threadId of touched.values())
      await recomputeThreadCache(orgId, threadId, { session });

    await publish(
      {
        orgId,
        topics: [
          "threads",
          "emails",
          ...threads.map((t) => `thread:${t._id.toHexString()}`),
          ...[...touched.keys()].map((id) => `thread:${id}`),
        ],
        patch: { trashed: true },
      },
      { session },
    );
    return { threads: threads.length, emails: emails.length };
  });
}

/** Restores trashed threads and emails (the 5-second Undo, and the Trash view). */
export async function restoreItems(ctx: OrgContext, input: TrashInput) {
  if (input.threadIds?.length) authorize(ctx, "thread:trash");
  if (input.emailIds?.length) authorize(ctx, "email:trash");
  await connectDb();
  const orgId = orgOid(ctx);
  const clear = { trashedAt: null, trashedBy: null, purgeAt: null };
  return withTransaction(async (session) => {
    const threads = await ThreadModel.find(
      {
        _id: { $in: ids(input.threadIds) },
        orgId,
        trashedAt: { $ne: null },
        ...projectFilter(ctx),
      },
      { _id: 1 },
      { session },
    ).lean();
    const threadIds = threads.map((t) => t._id);
    await ThreadModel.updateMany({ _id: { $in: threadIds }, orgId }, { $set: clear }, { session });
    await EmailModel.updateMany(
      { orgId, threadId: { $in: threadIds }, trashedAt: { $ne: null } },
      { $set: clear },
      { session },
    );
    const emails = await EmailModel.find(
      { _id: { $in: ids(input.emailIds) }, orgId, trashedAt: { $ne: null }, ...projectFilter(ctx) },
      { threadId: 1 },
      { session },
    ).lean();
    await EmailModel.updateMany(
      { _id: { $in: emails.map((e) => e._id) }, orgId },
      { $set: clear },
      { session },
    );
    const touched = new Map<string, Types.ObjectId>();
    for (const t of threadIds) touched.set(t.toHexString(), t);
    for (const e of emails) if (e.threadId) touched.set(e.threadId.toHexString(), e.threadId);
    for (const threadId of touched.values())
      await recomputeThreadCache(orgId, threadId, { session });
    await publish(
      {
        orgId,
        topics: ["threads", "emails", ...[...touched.keys()].map((id) => `thread:${id}`)],
        patch: { trashed: false },
      },
      { session },
    );
    return { threads: threads.length, emails: emails.length };
  });
}
