import "server-only";

import { Types, type ClientSession } from "mongoose";

import { decryptSecret } from "@/lib/crypto/envelope";
import { AttachmentModel } from "@/lib/db/models/attachments";
import { ConnectionModel } from "@/lib/db/models/connections";
import { EmailContentModel } from "@/lib/db/models/email-contents";
import { EmailModel } from "@/lib/db/models/emails";
import { ThreadMemberStateModel } from "@/lib/db/models/thread-member-states";
import { ThreadModel } from "@/lib/db/models/threads";
import { WebhookEventModel } from "@/lib/db/models/webhook-events";
import { withTransaction } from "@/lib/db/transaction";
import { PENDING_STATUSES } from "@/lib/mail/status";
import { publish } from "@/lib/realtime/publish";
import { getResendAdapter } from "@/lib/resend/client-factory";
import { getStore } from "@/lib/storage";
import { recomputeThreadCache } from "@/lib/services/threads";
import { keyAad } from "@/lib/services/webhook-secret";
import { writeTombstones, type TombstoneReason } from "./tombstones";

/**
 * Permanent delete of emails (TRD §2.14, DBD §5). Shared by the Delete permanently / Empty trash
 * actions, `bulk-delete`, `purge-trash`, `cleanup-rules` and (without tombstones) connection data
 * removal.
 *
 * Order matters and is what makes a failure recoverable:
 *  1. scheduled/queued emails are canceled in Resend first (one that cannot be canceled is kept);
 *  2. the R2 objects are deleted, before any document: if R2 fails the documents still name the
 *     keys and the next run retries; the other way round would orphan objects for good;
 *  3. one transaction writes the tombstones and removes contents, attachments, webhook events and
 *     the emails, then fixes (or removes) their threads.
 * `metric_rollups` and `usage_periods` are never touched, so insights and usage stay as they were.
 */

export type PurgeOptions = {
  reason: TombstoneReason;
  deletedBy?: Types.ObjectId | null;
  /** Default true. Off when the whole connection's data is going away. */
  tombstones?: boolean;
  /** Default true: cancel scheduled/queued emails in Resend before deleting them. */
  cancelPending?: boolean;
};

export type PurgeResult = {
  /** Emails removed. */
  deleted: number;
  /** Scheduled emails that could not be canceled in Resend (still there). */
  skipped: number;
  /** R2 objects removed. */
  files: number;
  /** Conversations removed because their last email went. */
  threads: number;
};

const CHUNK = 500;

async function adapterFor(orgId: Types.ObjectId, connectionId: Types.ObjectId) {
  const connection = await ConnectionModel.findOne(
    { _id: connectionId, orgId, deletedAt: null },
    { apiKey: 1 },
  );
  if (!connection?.apiKey) return null;
  return getResendAdapter(decryptSecret(connection.apiKey, { aad: keyAad(connection._id) }));
}

/** Returns the ids that may be deleted; scheduled ones Resend would not cancel stay. */
async function cancelPendingEmails(
  orgId: Types.ObjectId,
  emails: {
    _id: Types.ObjectId;
    connectionId: Types.ObjectId;
    status: string;
    resendId?: string | null;
  }[],
): Promise<Set<string>> {
  const blocked = new Set<string>();
  const adapters = new Map<string, Awaited<ReturnType<typeof adapterFor>>>();
  for (const email of emails) {
    if (!(PENDING_STATUSES as readonly string[]).includes(email.status)) continue;
    const id = email._id.toHexString();
    if (!email.resendId) {
      // Not handed to Resend yet: cancel locally unless the send job wins the race.
      const res = await EmailModel.updateOne(
        { _id: email._id, orgId, resendId: null, status: { $in: [...PENDING_STATUSES] } },
        { $set: { status: "canceled" } },
      );
      if (res.modifiedCount === 0) blocked.add(id);
      continue;
    }
    const key = email.connectionId.toHexString();
    if (!adapters.has(key)) adapters.set(key, await adapterFor(orgId, email.connectionId));
    const adapter = adapters.get(key);
    if (!adapter) {
      blocked.add(id);
      continue;
    }
    try {
      await adapter.cancelEmail(email.resendId);
    } catch {
      blocked.add(id);
    }
  }
  return blocked;
}

async function purgeChunk(
  orgId: Types.ObjectId,
  emailIds: Types.ObjectId[],
  options: PurgeOptions,
): Promise<PurgeResult> {
  const emails = await EmailModel.find(
    { _id: { $in: emailIds }, orgId },
    {
      connectionId: 1,
      direction: 1,
      resendId: 1,
      messageId: 1,
      threadId: 1,
      status: 1,
    },
  ).lean();
  if (emails.length === 0) return { deleted: 0, skipped: 0, files: 0, threads: 0 };

  let candidates = emails;
  let skipped = 0;
  if (options.cancelPending !== false) {
    const blocked = await cancelPendingEmails(orgId, emails);
    candidates = emails.filter((e) => !blocked.has(e._id.toHexString()));
    skipped = emails.length - candidates.length;
  }
  if (candidates.length === 0) return { deleted: 0, skipped, files: 0, threads: 0 };
  const ids = candidates.map((e) => e._id);

  // 2. Objects first.
  const [attachments, contents] = await Promise.all([
    AttachmentModel.find(
      { orgId, emailId: { $in: ids }, storageKey: { $ne: null } },
      { storageKey: 1 },
    ).lean(),
    EmailContentModel.find(
      { orgId, emailId: { $in: ids }, rawStorageKey: { $ne: null } },
      { rawStorageKey: 1 },
    ).lean(),
  ]);
  const keys = [...attachments.map((a) => a.storageKey!), ...contents.map((c) => c.rawStorageKey!)];
  if (keys.length > 0) await getStore().delete(keys);

  // 3. Documents.
  const threadIds = [
    ...new Map(
      candidates.filter((e) => e.threadId).map((e) => [e.threadId!.toHexString(), e.threadId!]),
    ).values(),
  ];
  const removedThreads = await withTransaction(async (session) => {
    if (options.tombstones !== false) {
      await writeTombstones(
        candidates.map((e) => ({
          orgId,
          connectionId: e.connectionId,
          direction: e.direction,
          resendId: e.resendId,
          messageId: e.messageId,
        })),
        { reason: options.reason, deletedBy: options.deletedBy ?? null, session },
      );
    }
    await EmailContentModel.deleteMany({ orgId, emailId: { $in: ids } }, { session });
    await AttachmentModel.deleteMany({ orgId, emailId: { $in: ids } }, { session });
    await WebhookEventModel.deleteMany({ orgId, emailId: { $in: ids } }, { session });
    await EmailModel.deleteMany({ _id: { $in: ids }, orgId }, { session });
    const removed = await settleThreads(orgId, threadIds, session);
    await publish(
      {
        orgId,
        topics: ["threads", "emails", ...threadIds.map((t) => `thread:${t.toHexString()}`)],
        patch: { deleted: true },
      },
      { session },
    );
    return removed;
  });

  return {
    deleted: candidates.length,
    skipped,
    files: keys.length,
    threads: removedThreads,
  };
}

/** Removes threads left without emails and recomputes the counters of the others. */
async function settleThreads(
  orgId: Types.ObjectId,
  threadIds: Types.ObjectId[],
  session: ClientSession,
): Promise<number> {
  let removed = 0;
  for (const threadId of threadIds) {
    const left = await EmailModel.countDocuments({ orgId, threadId }).session(session);
    if (left === 0) {
      await ThreadModel.deleteOne({ _id: threadId, orgId }, { session });
      await ThreadMemberStateModel.deleteMany({ orgId, threadId }, { session });
      removed++;
    } else {
      await recomputeThreadCache(orgId, threadId, { session });
    }
  }
  return removed;
}

/**
 * Permanently deletes emails of one org. Work is chunked (500 emails per transaction); a failure
 * in a chunk throws with earlier chunks already gone, so callers can simply run it again.
 */
export async function purgeEmails(
  orgId: Types.ObjectId,
  emailIds: Types.ObjectId[],
  options: PurgeOptions,
): Promise<PurgeResult> {
  const total: PurgeResult = { deleted: 0, skipped: 0, files: 0, threads: 0 };
  for (let i = 0; i < emailIds.length; i += CHUNK) {
    const part = await purgeChunk(orgId, emailIds.slice(i, i + CHUNK), options);
    total.deleted += part.deleted;
    total.skipped += part.skipped;
    total.files += part.files;
    total.threads += part.threads;
  }
  return total;
}

/**
 * Deletes trashed threads that have no email left (a conversation whose emails went one by one),
 * so Empty trash leaves nothing behind. Returns how many.
 */
export async function sweepEmptyThreads(
  orgId: Types.ObjectId,
  options: { trashedOnly?: boolean } = {},
): Promise<number> {
  const candidates = await ThreadModel.find(
    { orgId, ...(options.trashedOnly === false ? {} : { trashedAt: { $ne: null } }) },
    { _id: 1 },
  )
    .limit(5000)
    .lean();
  let removed = 0;
  for (let i = 0; i < candidates.length; i += 200) {
    const ids = candidates.slice(i, i + 200).map((t) => t._id);
    const used = await EmailModel.distinct("threadId", { orgId, threadId: { $in: ids } });
    const usedSet = new Set(used.map((u: Types.ObjectId) => u.toHexString()));
    const empty = ids.filter((id) => !usedSet.has(id.toHexString()));
    if (empty.length === 0) continue;
    await ThreadModel.deleteMany({ _id: { $in: empty }, orgId });
    await ThreadMemberStateModel.deleteMany({ orgId, threadId: { $in: empty } });
    removed += empty.length;
  }
  return removed;
}
