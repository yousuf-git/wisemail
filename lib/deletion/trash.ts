import "server-only";

import { Types } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { EmailModel } from "@/lib/db/models/emails";
import { ThreadModel } from "@/lib/db/models/threads";
import type { BulkOperationDTO, PermanentDeleteResultDTO } from "@/lib/dto/deletion";
import { writeAuditLog } from "@/lib/services/audit";
import { ServiceError } from "@/lib/services/errors";
import { projectFilter } from "@/lib/services/project-scope";
import { INLINE_LIMIT, startBulkOperation } from "./bulk";
import { purgeEmails, sweepEmptyThreads } from "./purge";

/**
 * Permanent delete and Empty trash (TRD §2.14, PRD §5.16, UC-37). Trash and restore of chosen
 * items are in `lib/services/threads.ts`; large or "all matching" selections are in `bulk.ts`.
 * Owner and Admin only (`email:delete`); every call is audited.
 */

const ids = (values: string[] | undefined) =>
  (values ?? []).filter((v) => /^[0-9a-f]{24}$/i.test(v)).map((v) => new Types.ObjectId(v));

export type PermanentDeleteInput = { threadIds?: string[]; emailIds?: string[] };

/**
 * Deletes the chosen conversations (with all their emails) and single emails for good: R2 objects
 * first, then the documents, with tombstones so sync and late events never recreate them. Scheduled
 * emails are canceled in Resend first; one Resend will not cancel is kept and counted as skipped.
 * Only items the member can see are touched; ids of other orgs are ignored.
 */
export async function permanentlyDeleteItems(
  ctx: OrgContext,
  input: PermanentDeleteInput,
): Promise<PermanentDeleteResultDTO> {
  authorize(ctx, "email:delete");
  await connectDb();
  const orgId = new Types.ObjectId(ctx.org.id);
  const scoped = projectFilter(ctx);

  const threads = await ThreadModel.find(
    { _id: { $in: ids(input.threadIds) }, orgId, ...scoped },
    { _id: 1 },
  ).lean();
  const emailIds = new Map<string, Types.ObjectId>();
  if (threads.length) {
    const inThreads = await EmailModel.find(
      { orgId, threadId: { $in: threads.map((t) => t._id) } },
      { _id: 1 },
    ).lean();
    for (const e of inThreads) emailIds.set(e._id.toHexString(), e._id);
  }
  const singles = await EmailModel.find(
    { _id: { $in: ids(input.emailIds) }, orgId, ...scoped },
    { _id: 1 },
  ).lean();
  for (const e of singles) emailIds.set(e._id.toHexString(), e._id);

  const result = await purgeEmails(orgId, [...emailIds.values()], {
    reason: "user",
    deletedBy: new Types.ObjectId(ctx.user.id),
  });
  // Conversations that had no emails behind them.
  if (threads.length) {
    const used = await EmailModel.distinct("threadId", {
      orgId,
      threadId: { $in: threads.map((t) => t._id) },
    });
    const usedSet = new Set(used.map((u: Types.ObjectId) => u.toHexString()));
    const empty = threads.filter((t) => !usedSet.has(t._id.toHexString()));
    if (empty.length)
      await ThreadModel.deleteMany({ _id: { $in: empty.map((t) => t._id) }, orgId });
  }

  if (result.deleted > 0) {
    await writeAuditLog({
      orgId,
      actor: { type: "user", id: new Types.ObjectId(ctx.user.id) },
      action: "mail.deleted_permanently",
      target: { type: "mail", id: threads[0]?._id ?? singles[0]?._id ?? orgId },
      changes: { after: { emails: result.deleted, conversations: threads.length } },
    });
  }
  return { deleted: result.deleted, skipped: result.skipped };
}

export type EmptyTrashResult =
  { mode: "done"; deleted: number; skipped: number } | { mode: "job"; operation: BulkOperationDTO };

/** Number of emails in Trash the member can see (the Empty trash confirmation). */
export async function countTrash(ctx: OrgContext): Promise<number> {
  authorize(ctx, "thread:read");
  await connectDb();
  return EmailModel.countDocuments({
    orgId: new Types.ObjectId(ctx.org.id),
    trashedAt: { $ne: null },
    ...projectFilter(ctx),
  });
}

/**
 * Empty trash. Up to 100 emails are deleted right away; more start the `bulk-delete` job, which
 * reports progress. `confirmCount` (the number typed) must equal the current count for the job.
 */
export async function emptyTrash(
  ctx: OrgContext,
  input: { confirmCount?: number } = {},
): Promise<EmptyTrashResult> {
  authorize(ctx, "email:delete");
  await connectDb();
  const count = await countTrash(ctx);
  if (count === 0) {
    await sweepEmptyThreads(new Types.ObjectId(ctx.org.id));
    return { mode: "done", deleted: 0, skipped: 0 };
  }
  if (count > INLINE_LIMIT) {
    if (input.confirmCount !== count) {
      throw new ServiceError(
        "validation",
        `Type ${count.toLocaleString("en-US")} to confirm. The number of emails in Trash changed.`,
        { confirmCount: [`Type ${count} to confirm.`] },
      );
    }
    const operation = await startBulkOperation(ctx, {
      action: "delete",
      filter: { source: "trash" },
      confirmCount: count,
      reason: "empty_trash",
    });
    return { mode: "job", operation };
  }
  const emails = await EmailModel.find(
    { orgId: new Types.ObjectId(ctx.org.id), trashedAt: { $ne: null }, ...projectFilter(ctx) },
    { _id: 1 },
  ).lean();
  const result = await purgeEmails(
    new Types.ObjectId(ctx.org.id),
    emails.map((e) => e._id),
    {
      reason: "user",
      deletedBy: new Types.ObjectId(ctx.user.id),
    },
  );
  await sweepEmptyThreads(new Types.ObjectId(ctx.org.id));
  await writeAuditLog({
    orgId: new Types.ObjectId(ctx.org.id),
    actor: { type: "user", id: new Types.ObjectId(ctx.user.id) },
    action: "mail.trash_emptied",
    target: { type: "trash", id: new Types.ObjectId(ctx.org.id) },
    changes: { after: { emails: result.deleted } },
  });
  return { mode: "done", deleted: result.deleted, skipped: result.skipped };
}
