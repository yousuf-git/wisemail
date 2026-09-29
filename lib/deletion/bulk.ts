import "server-only";

import { Types, type ClientSession } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { BulkOperationModel, type BulkOperationDoc } from "@/lib/db/models/bulk-operations";
import { EmailModel, TRASH_RETENTION_DAYS } from "@/lib/db/models/emails";
import { ThreadModel } from "@/lib/db/models/threads";
import { withTransaction } from "@/lib/db/transaction";
import type { BulkOperationDTO } from "@/lib/dto/deletion";
import { env } from "@/lib/env";
import { enqueueBulkDelete } from "@/lib/jobs/send";
import { publish } from "@/lib/realtime/publish";
import { ServiceError } from "@/lib/services/errors";
import { writeAuditLog } from "@/lib/services/audit";
import { shouldRunInline } from "@/lib/services/sync";
import { recomputeThreadCache } from "@/lib/services/threads";
import {
  bulkFilterSchema,
  countSelection,
  resolveSelection,
  targetOf,
  type BulkFilter,
} from "./filters";
import { purgeEmails, sweepEmptyThreads } from "./purge";

/**
 * Bulk trash / permanent delete / restore (TRD §2.14, PRD §5.16). A request snapshots the filter
 * and a cap time into a `bulk_operations` document; batches of 500 (one transaction each) are run
 * by the `bulk-delete` job, or inline when the selection is small. A batch is idempotent: the
 * document's `cursor` only moves forward after a batch succeeded, and every action ignores items
 * that are already in the target state, so a retried step never repeats work.
 */

export const BATCH_SIZE = 500;
/** Selections up to this many items run inline, without the job (TRD §2.14). */
export const INLINE_LIMIT = 100;
const OPERATION_TTL_MS = 7 * 86_400_000;
const AUDIT_ACTION = {
  trash: "mail.bulk_trashed",
  delete: "mail.bulk_deleted",
  restore: "mail.bulk_restored",
} as const;

export type StartBulkInput = {
  action: "trash" | "delete" | "restore";
  filter: BulkFilter;
  /** Required for `delete`: the number the person typed; must equal the current match count. */
  confirmCount?: number;
  reason?: "bulk" | "empty_trash";
};

const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);
const userOid = (ctx: OrgContext) => new Types.ObjectId(ctx.user.id);

function toDTO(op: {
  _id: Types.ObjectId;
  action: "trash" | "delete" | "restore";
  status: "queued" | "running" | "done" | "failed";
  total: number;
  processed: number;
  error?: string | null;
  createdAt: Date;
}): BulkOperationDTO {
  return {
    id: op._id.toHexString(),
    action: op.action,
    status: op.status,
    total: op.total,
    processed: Math.min(op.processed, op.total),
    error: op.error ?? null,
    undoable: op.action === "trash" && op.status === "done" && op.processed > 0,
    createdAt: op.createdAt.toISOString(),
  };
}

function authorizeBulk(ctx: OrgContext, input: StartBulkInput) {
  if (input.action === "delete") return authorize(ctx, "email:delete");
  if (input.action === "restore") {
    if (!ctx.can("thread:trash") && !ctx.can("email:trash")) authorize(ctx, "email:trash");
    return;
  }
  // Moving to Trash follows the member's normal access: conversations for the Inbox, emails
  // for Activity.
  authorize(ctx, input.filter.source === "inbox" ? "thread:trash" : "email:trash");
}

/** How many items "all matching" selects right now (for the confirmation). */
export async function countMatching(ctx: OrgContext, filter: BulkFilter): Promise<number> {
  authorize(ctx, filter.source === "inbox" ? "thread:read" : "activity:read");
  await connectDb();
  return countSelection(
    { orgId: orgOid(ctx), projectScope: ctx.projectScope },
    bulkFilterSchema.parse(filter),
  );
}

/**
 * Starts a bulk operation. Small selections finish before this returns; larger ones are handed
 * to the `bulk-delete` job and reported through `getBulkOperation` (and realtime `bulk:<id>`).
 */
export async function startBulkOperation(
  ctx: OrgContext,
  input: StartBulkInput,
): Promise<BulkOperationDTO> {
  authorizeBulk(ctx, input);
  const filter = bulkFilterSchema.parse(input.filter);
  if (filter.source === "inbox" && input.action === "restore") {
    throw new ServiceError("validation", "Conversations in the Inbox are not in Trash.");
  }
  if ((filter.source === "trash" || filter.source === "operation") && input.action === "trash") {
    throw new ServiceError("validation", "These items are already in Trash.");
  }
  await connectDb();
  const orgId = orgOid(ctx);
  const scope = { orgId, projectScope: ctx.projectScope };
  const total = await countSelection(scope, filter);
  if (total === 0) throw new ServiceError("not_found", "Nothing matches anymore.");
  if (input.action === "delete" && input.confirmCount !== total) {
    throw new ServiceError(
      "validation",
      `Type ${total.toLocaleString("en-US")} to confirm. The number of matching items changed since you looked.`,
      { confirmCount: [`Type ${total} to confirm.`] },
    );
  }

  const now = new Date();
  const op = await BulkOperationModel.create({
    orgId,
    action: input.action,
    target: targetOf(filter),
    filter,
    scoped: ctx.projectScope !== null,
    projectScope: (ctx.projectScope ?? []).map((id) => new Types.ObjectId(id)),
    capAt: now,
    reason: input.reason ?? "bulk",
    total,
    undoOf: filter.source === "operation" ? new Types.ObjectId(filter.opId) : null,
    createdBy: userOid(ctx),
    expireAt: new Date(now.getTime() + OPERATION_TTL_MS),
  });

  if (total <= INLINE_LIMIT) {
    await runBulkToCompletion(op._id.toHexString());
  } else {
    const delivered = await enqueueBulkDelete({
      opId: op._id.toHexString(),
      orgId: orgId.toHexString(),
    });
    // Development without an Inngest dev server: work through it in this process.
    if (shouldRunInline({ delivered, inngestDev: env.INNGEST_DEV, nodeEnv: env.NODE_ENV })) {
      void runBulkToCompletion(op._id.toHexString()).catch((error) =>
        console.error("[bulk] inline run failed", error),
      );
    }
  }
  const fresh = await BulkOperationModel.findById(op._id).lean();
  return toDTO(fresh ?? op);
}

/** Progress of one operation, for the progress bar (org-scoped: another org's id is "not found"). */
export async function getBulkOperation(ctx: OrgContext, opId: string): Promise<BulkOperationDTO> {
  await connectDb();
  if (!Types.ObjectId.isValid(opId)) throw new ServiceError("not_found", "Not found.");
  const op = await BulkOperationModel.findOne({ _id: opId, orgId: orgOid(ctx) }).lean();
  if (!op) throw new ServiceError("not_found", "Not found.");
  return toDTO(op);
}

/* ------------------------------------------------------------------------------------------ */
/* Running                                                                                     */
/* ------------------------------------------------------------------------------------------ */

const and = (...parts: Record<string, unknown>[]) => ({
  $and: parts.filter((p) => Object.keys(p).length > 0),
});

/** Moves conversations (and all their emails) or single emails to Trash. */
async function trashBatch(
  op: BulkOperationDoc,
  ids: Types.ObjectId[],
  session: ClientSession,
): Promise<void> {
  const now = new Date();
  const fields = {
    trashedAt: now,
    trashedBy: op.createdBy,
    purgeAt: new Date(now.getTime() + TRASH_RETENTION_DAYS * 86_400_000),
    trashedByOpId: op._id,
  };
  const orgId = op.orgId;
  if (op.target === "threads") {
    await ThreadModel.updateMany(
      { _id: { $in: ids }, orgId, trashedAt: null },
      { $set: fields },
      { session },
    );
    await EmailModel.updateMany(
      { orgId, threadId: { $in: ids }, trashedAt: null },
      { $set: fields },
      { session },
    );
    return;
  }
  const emails = await EmailModel.find(
    { _id: { $in: ids }, orgId, trashedAt: null },
    { threadId: 1 },
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
  for (const threadId of touched.values()) await recomputeThreadCache(orgId, threadId, { session });
}

/** Brings emails back from Trash, and their conversations with them. */
async function restoreBatch(
  op: BulkOperationDoc,
  ids: Types.ObjectId[],
  session: ClientSession,
): Promise<void> {
  const orgId = op.orgId;
  const clear = { trashedAt: null, trashedBy: null, purgeAt: null, trashedByOpId: null };
  const emails = await EmailModel.find(
    { _id: { $in: ids }, orgId, trashedAt: { $ne: null } },
    { threadId: 1 },
    { session },
  ).lean();
  await EmailModel.updateMany(
    { _id: { $in: emails.map((e) => e._id) }, orgId },
    { $set: clear },
    { session },
  );
  const threadIds = [
    ...new Map(
      emails.filter((e) => e.threadId).map((e) => [e.threadId!.toHexString(), e.threadId!]),
    ).values(),
  ];
  await ThreadModel.updateMany(
    { _id: { $in: threadIds }, orgId, trashedAt: { $ne: null } },
    { $set: clear },
    { session },
  );
  for (const threadId of threadIds) await recomputeThreadCache(orgId, threadId, { session });
}

/** Permanently deletes emails, or every email of the chosen conversations. */
async function deleteBatch(op: BulkOperationDoc, ids: Types.ObjectId[]): Promise<void> {
  const orgId = op.orgId;
  let emailIds = ids;
  if (op.target === "threads") {
    const emails = await EmailModel.find({ orgId, threadId: { $in: ids } }, { _id: 1 }).lean();
    emailIds = emails.map((e) => e._id);
  }
  await purgeEmails(orgId, emailIds, { reason: "bulk", deletedBy: op.createdBy });
  if (op.target === "threads") {
    // Conversations that never had documents behind them.
    const remaining = await EmailModel.distinct("threadId", { orgId, threadId: { $in: ids } });
    const kept = new Set(remaining.map((r: Types.ObjectId) => r.toHexString()));
    const orphans = ids.filter((id) => !kept.has(id.toHexString()));
    if (orphans.length) await ThreadModel.deleteMany({ _id: { $in: orphans }, orgId });
  }
}

export type BulkStepResult = { done: boolean; processed: number; total: number };

/**
 * Runs one batch. Safe to repeat: the cursor advances only after the batch succeeded, and a
 * second run of the same step finds the items already processed (or the cursor already moved).
 */
export async function runBulkStep(opId: string): Promise<BulkStepResult> {
  await connectDb();
  if (!Types.ObjectId.isValid(opId)) return { done: true, processed: 0, total: 0 };
  const op = await BulkOperationModel.findById(opId);
  if (!op) return { done: true, processed: 0, total: 0 };
  if (op.status === "done" || op.status === "failed") {
    return { done: true, processed: op.processed, total: op.total };
  }
  if (op.status === "queued") {
    await BulkOperationModel.updateOne(
      { _id: op._id, status: "queued" },
      { $set: { status: "running" } },
    );
  }

  try {
    const { query, target } = await resolveSelection(
      {
        orgId: op.orgId,
        projectScope: op.scoped ? op.projectScope.map((p) => p.toHexString()) : null,
      },
      op.filter as BulkFilter,
    );
    const Model = target === "threads" ? ThreadModel : EmailModel;
    const cursor = op.cursor ? { _id: { $gt: op.cursor } } : {};
    const found = await (Model as typeof EmailModel)
      .find(and(query, { createdAt: { $lte: op.capAt } }, cursor), { _id: 1 })
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean();
    const ids = found.map((f) => f._id);

    if (ids.length === 0) {
      await finish(op);
      return { done: true, processed: op.processed, total: op.total };
    }

    if (op.action === "trash") await withTransaction((session) => trashBatch(op, ids, session));
    else if (op.action === "restore")
      await withTransaction((session) => restoreBatch(op, ids, session));
    else await deleteBatch(op, ids);

    const last = ids.at(-1)!;
    // Conditional on the old cursor: a duplicate run of this step must not count it twice.
    const moved = await BulkOperationModel.findOneAndUpdate(
      { _id: op._id, cursor: op.cursor ?? null },
      { $set: { cursor: last }, $inc: { processed: ids.length } },
      { returnDocument: "after" },
    );
    const processed = moved?.processed ?? op.processed;
    await publish({
      orgId: op.orgId,
      topics: [`bulk:${op._id.toHexString()}`],
      patch: { opId: op._id.toHexString(), processed, total: op.total, status: "running" },
    });
    if (ids.length < BATCH_SIZE) {
      await finish(moved ?? op);
      return { done: true, processed, total: op.total };
    }
    return { done: false, processed, total: op.total };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk operation failed";
    // Leave the operation `running`: the job retries the step. Only a give-up marks it failed.
    console.error("[bulk] step failed", opId, error);
    throw new Error(message, { cause: error });
  }
}

async function finish(op: BulkOperationDoc) {
  const claimed = await BulkOperationModel.findOneAndUpdate(
    { _id: op._id, status: { $in: ["queued", "running"] } },
    { $set: { status: "done", finishedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!claimed) return; // another run finished it (and audited it)
  if (claimed.action === "delete") await sweepEmptyThreads(claimed.orgId);
  await withTransaction(async (session) => {
    await writeAuditLog(
      {
        orgId: claimed.orgId,
        actor: { type: "user", id: claimed.createdBy },
        action: AUDIT_ACTION[claimed.action],
        target: { type: "bulk_operation", id: claimed._id },
        changes: {
          after: {
            count: Math.min(claimed.processed, claimed.total),
            source: (claimed.filter as BulkFilter).source,
            reason: claimed.reason,
          },
        },
      },
      { session },
    );
    await publish(
      {
        orgId: claimed.orgId,
        topics: [`bulk:${claimed._id.toHexString()}`, "threads", "emails"],
        patch: {
          opId: claimed._id.toHexString(),
          processed: claimed.processed,
          total: claimed.total,
          status: "done",
        },
      },
      { session },
    );
  });
}

/** Marks an operation failed after the job gave up. */
export async function failBulkOperation(opId: string, message: string) {
  await connectDb();
  if (!Types.ObjectId.isValid(opId)) return;
  const op = await BulkOperationModel.findOneAndUpdate(
    { _id: opId, status: { $in: ["queued", "running"] } },
    { $set: { status: "failed", error: message.slice(0, 500), finishedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (op) {
    await publish({
      orgId: op.orgId,
      topics: [`bulk:${op._id.toHexString()}`],
      patch: { opId, status: "failed" },
    });
  }
}

/** Runs every batch in this process (small operations, tests, and dev without Inngest). */
export async function runBulkToCompletion(opId: string, maxBatches = 1000) {
  for (let i = 0; i < maxBatches; i++) {
    const step = await runBulkStep(opId);
    if (step.done) return step;
  }
  return runBulkStep(opId);
}
