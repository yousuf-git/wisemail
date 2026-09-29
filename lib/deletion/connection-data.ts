import "server-only";

import { Types } from "mongoose";

import { connectDb } from "@/lib/db/connect";
import { ApiKeyModel } from "@/lib/db/models/api-keys";
import { AutomationModel } from "@/lib/db/models/automations";
import { BroadcastModel } from "@/lib/db/models/broadcasts";
import { ContactImportModel } from "@/lib/db/models/contact-imports";
import { ContactPropertyModel } from "@/lib/db/models/contact-properties";
import { ContactModel } from "@/lib/db/models/contacts";
import { DomainModel } from "@/lib/db/models/domains";
import { EmailModel } from "@/lib/db/models/emails";
import { SegmentModel } from "@/lib/db/models/segments";
import { SyncRunModel } from "@/lib/db/models/sync-run";
import { TemplateModel } from "@/lib/db/models/templates";
import { ThreadMemberStateModel } from "@/lib/db/models/thread-member-states";
import { ThreadModel } from "@/lib/db/models/threads";
import { TopicModel } from "@/lib/db/models/topics";
import { WebhookEventModel } from "@/lib/db/models/webhook-events";
import { publish } from "@/lib/realtime/publish";
import { writeAuditLog } from "@/lib/services/audit";
import { purgeEmails } from "./purge";

/**
 * "Delete synced data" when a connection is removed (DBD §5, UC-06): the Resend mirrors and the
 * mail of that one connection. Every query names both `orgId` and `connectionId`, so nothing of
 * another connection or org is touched. `metric_rollups` stay (insights and usage do not change
 * when data is deleted, PRD §5.16); senders were already set to `connection_inactive`. Files in R2
 * go first (`purgeEmails`). No tombstones: the webhook is gone and the connection cannot sync.
 */

const BATCH = 500;

const MIRRORS = [
  ["domains", DomainModel],
  ["apiKeys", ApiKeyModel],
  ["segments", SegmentModel],
  ["topics", TopicModel],
  ["contactProperties", ContactPropertyModel],
  ["templates", TemplateModel],
  ["contacts", ContactModel],
  ["broadcasts", BroadcastModel],
  ["automations", AutomationModel],
  ["contactImports", ContactImportModel],
] as const;

export type ConnectionDataStep = {
  done: boolean;
  /** Emails removed by this step. */
  emails: number;
  /** Set on the last step. */
  removed?: Record<string, number>;
};

/**
 * One batch of the deletion: up to 500 emails (with bodies, files, events); once none are left,
 * the leftovers and the mirrors. Safe to repeat.
 */
export async function runConnectionDataStep(input: {
  connectionId: string;
  orgId: string;
}): Promise<ConnectionDataStep> {
  await connectDb();
  if (!Types.ObjectId.isValid(input.connectionId) || !Types.ObjectId.isValid(input.orgId)) {
    return { done: true, emails: 0 };
  }
  const orgId = new Types.ObjectId(input.orgId);
  const connectionId = new Types.ObjectId(input.connectionId);

  const emails = await EmailModel.find({ orgId, connectionId }, { _id: 1 }).limit(BATCH).lean();
  if (emails.length > 0) {
    const result = await purgeEmails(
      orgId,
      emails.map((e) => e._id),
      { reason: "user", tombstones: false, cancelPending: false },
    );
    // A batch that deleted nothing would loop forever; the documents are gone or unreadable.
    return { done: false, emails: result.deleted };
  }

  const removed: Record<string, number> = {};
  const threads = await ThreadModel.find({ orgId, connectionId }, { _id: 1 }).lean();
  if (threads.length) {
    await ThreadMemberStateModel.deleteMany({
      orgId,
      threadId: { $in: threads.map((t) => t._id) },
    });
    removed.threads = (await ThreadModel.deleteMany({ orgId, connectionId })).deletedCount;
  }
  removed.events = (await WebhookEventModel.deleteMany({ orgId, connectionId })).deletedCount;
  await SyncRunModel.deleteMany({ connectionId });
  for (const [name, Model] of MIRRORS) {
    const res = await (Model as typeof DomainModel).deleteMany({ orgId, connectionId });
    removed[name] = res.deletedCount;
  }
  await publish({
    orgId,
    topics: ["threads", "emails", "domains", "connections", `connection:${input.connectionId}`],
    patch: { dataDeleted: true },
  });
  return { done: true, emails: 0, removed };
}

/** Runs every step in this process (tests, and development without an Inngest server). */
export async function runConnectionDataToCompletion(
  input: { connectionId: string; orgId: string; requestedBy?: string },
  maxSteps = 10_000,
) {
  let emails = 0;
  for (let i = 0; i < maxSteps; i++) {
    const step = await runConnectionDataStep(input);
    emails += step.emails;
    if (step.done) {
      await recordConnectionDataDeleted({ ...input, emails, removed: step.removed ?? {} });
      return { emails, removed: step.removed ?? {} };
    }
  }
  return { emails, removed: {} };
}

export async function recordConnectionDataDeleted(input: {
  connectionId: string;
  orgId: string;
  requestedBy?: string;
  emails: number;
  removed: Record<string, number>;
}) {
  await connectDb();
  await writeAuditLog({
    orgId: new Types.ObjectId(input.orgId),
    actor:
      input.requestedBy && Types.ObjectId.isValid(input.requestedBy)
        ? { type: "user", id: new Types.ObjectId(input.requestedBy) }
        : { type: "system" },
    action: "connection.data_deleted",
    target: { type: "connection", id: new Types.ObjectId(input.connectionId) },
    changes: { after: { emails: input.emails, ...input.removed } },
  });
}
