import "server-only";

import { Types } from "mongoose";

import { getRetentionDays } from "@/lib/billing/entitlements";
import { connectDb } from "@/lib/db/connect";
import { AttachmentModel } from "@/lib/db/models/attachments";
import { EmailContentModel } from "@/lib/db/models/email-contents";
import { EmailModel } from "@/lib/db/models/emails";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { ThreadModel } from "@/lib/db/models/threads";
import { getStore } from "@/lib/storage";
import { purgeEmails, sweepEmptyThreads } from "./purge";

/**
 * Scheduled deletion: `purge-trash` (30 days after `trashedAt`) and `retention` (history older
 * than the plan allows). Both delete R2 objects before documents (`purgeEmails`), so a failed run
 * is retried without orphaning files.
 */

const BATCH = 500;
const DAY = 86_400_000;

export type PurgeTrashSummary = { emails: number; files: number; orgs: number };

/**
 * Permanently deletes every email whose `purgeAt` has passed (TRD §2.14 `purge-trash`), with
 * tombstones (`trash_purge`). Bounded per run (`maxBatches`); what is left is caught the next day.
 */
export async function purgeExpiredTrash(
  now: Date = new Date(),
  options: { maxBatches?: number } = {},
): Promise<PurgeTrashSummary> {
  await connectDb();
  const summary: PurgeTrashSummary = { emails: 0, files: 0, orgs: 0 };
  const touched = new Set<string>();
  for (let batch = 0; batch < (options.maxBatches ?? 200); batch++) {
    const due = await EmailModel.find(
      { trashedAt: { $ne: null }, purgeAt: { $ne: null, $lte: now } },
      { orgId: 1 },
    )
      .sort({ purgeAt: 1, _id: 1 })
      .limit(BATCH)
      .lean();
    if (due.length === 0) break;
    const byOrg = new Map<string, Types.ObjectId[]>();
    for (const e of due) {
      const key = e.orgId.toHexString();
      byOrg.set(key, [...(byOrg.get(key) ?? []), e._id]);
    }
    let progressed = 0;
    for (const [orgKey, ids] of byOrg) {
      const result = await purgeEmails(new Types.ObjectId(orgKey), ids, {
        reason: "trash_purge",
        deletedBy: null,
        // Scheduled mail that is in Trash is canceled first; one Resend refuses stays for now.
      });
      summary.emails += result.deleted;
      summary.files += result.files;
      progressed += result.deleted;
      touched.add(orgKey);
    }
    // Nothing deletable in a whole batch (e.g. only uncancelable mail): stop instead of looping.
    if (progressed === 0) break;
  }
  // Trashed conversations left without emails.
  const threads = await ThreadModel.find(
    { trashedAt: { $ne: null }, purgeAt: { $ne: null, $lte: now } },
    { orgId: 1 },
  )
    .limit(2000)
    .lean();
  for (const orgId of new Set([...touched, ...threads.map((t) => t.orgId.toHexString())])) {
    await sweepEmptyThreads(new Types.ObjectId(orgId));
  }
  summary.orgs = touched.size;
  return summary;
}

export type RetentionSummary = {
  orgs: number;
  emails: number;
  files: number;
  /** Bodies and files whose email was already gone (e.g. removed by a TTL index). */
  orphans: number;
};

/** Age after which history goes, per org: the plan's retention (override, else catalog). */
export async function orgRetentionCutoff(orgId: Types.ObjectId, now: Date): Promise<Date> {
  const days = await getRetentionDays(orgId);
  return new Date(now.getTime() - days * DAY);
}

/**
 * Deletes one org's emails (with contents, attachments, R2 objects, webhook events and emptied
 * threads) older than its plan's retention. No tombstones: sync never imports mail older than the
 * retention window (DBD §5), so nothing can bring it back.
 */
export async function applyOrgRetention(
  orgId: Types.ObjectId,
  now: Date = new Date(),
  options: { maxBatches?: number } = {},
): Promise<{ emails: number; files: number }> {
  await connectDb();
  const cutoff = await orgRetentionCutoff(orgId, now);
  let emails = 0;
  let files = 0;
  for (let batch = 0; batch < (options.maxBatches ?? 200); batch++) {
    const old = await EmailModel.find({ orgId, createdAt: { $lt: cutoff } }, { _id: 1 })
      .sort({ _id: 1 })
      .limit(BATCH)
      .lean();
    if (old.length === 0) break;
    const result = await purgeEmails(
      orgId,
      old.map((e) => e._id),
      { reason: "trash_purge", tombstones: false, cancelPending: false },
    );
    emails += result.deleted;
    files += result.files;
    if (result.deleted === 0) break;
  }
  if (emails > 0) await sweepEmptyThreads(orgId, { trashedOnly: false });
  return { emails, files };
}

/**
 * Bodies and files past their `expireAt` whose email is already gone. `email_contents` and
 * `attachments` have no TTL index (they own R2 objects), so an email removed by its own TTL leaves
 * them behind; delete the objects first, then the documents (DBD §1 rule 8).
 */
export async function sweepExpiredOrphans(now: Date = new Date(), maxBatches = 100) {
  let orphans = 0;
  let files = 0;
  for (const [Model, field] of [
    [AttachmentModel, "storageKey"],
    [EmailContentModel, "rawStorageKey"],
  ] as const) {
    const M = Model as typeof AttachmentModel;
    let after: Types.ObjectId | null = null;
    for (let batch = 0; batch < maxBatches; batch++) {
      const docs: { _id: Types.ObjectId; emailId?: Types.ObjectId | null }[] = await M.find(
        {
          expireAt: { $ne: null, $lte: now },
          emailId: { $ne: null },
          ...(after ? { _id: { $gt: after } } : {}),
        },
        { emailId: 1, orgId: 1, [field]: 1 },
      )
        .sort({ _id: 1 })
        .limit(BATCH)
        .lean();
      if (docs.length === 0) break;
      after = docs.at(-1)!._id;
      const present = await EmailModel.distinct("_id", {
        _id: { $in: docs.map((d) => d.emailId) },
      });
      const alive = new Set((present as Types.ObjectId[]).map((id) => id.toHexString()));
      const dead = docs.filter((d) => !alive.has(d.emailId!.toHexString()));
      if (dead.length === 0) continue;
      const keys = dead
        .map((d) => (d as unknown as Record<string, string | null | undefined>)[field])
        .filter((k): k is string => !!k);
      if (keys.length) await getStore().delete(keys);
      await M.deleteMany({ _id: { $in: dead.map((d) => d._id) } });
      orphans += dead.length;
      files += keys.length;
    }
  }
  return { orphans, files };
}

/** Every org in turn (used by the `retention` job, one step per org). */
export async function listOrgsForRetention(): Promise<string[]> {
  await connectDb();
  const settings = await OrgSettingsModel.find({ deletedAt: null }, { orgId: 1 }).lean();
  return settings.map((s) => s.orgId.toHexString());
}
