import "server-only";

import { Types } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { AttachmentModel, type AttachmentDoc } from "@/lib/db/models/attachments";
import { DraftModel, type DraftDoc } from "@/lib/db/models/drafts";
import { EmailModel } from "@/lib/db/models/emails";
import { SenderModel } from "@/lib/db/models/senders";
import { ThreadModel } from "@/lib/db/models/threads";
import { assertRefs } from "@/lib/db/refs";
import type { AttachmentDTO, DraftDTO } from "@/lib/dto/mail";
import { sanitizeFilename } from "@/lib/mail/parse";
import { presignUpload } from "@/lib/storage/presign";
import { getStore, storageKeys } from "@/lib/storage";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_EMAIL_BYTES,
  saveDraftInput,
  type SaveDraftInput,
} from "@/lib/validation/mail";
import { ServiceError } from "./errors";

const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);
const userOid = (ctx: OrgContext) => new Types.ObjectId(ctx.user.id);
const hex = (id: Types.ObjectId | null | undefined) => id?.toHexString() ?? null;
const versionOf = (doc: unknown) => (doc as { __v?: number }).__v ?? 0;

const conflict = () =>
  new ServiceError("conflict", "This draft was changed elsewhere. Reload to see the latest.");

export const attachmentDownloadPath = (id: Types.ObjectId | string) =>
  `/api/files/${id.toString()}`;

export function toAttachmentDTO(
  a: AttachmentDoc | ReturnType<AttachmentDoc["toObject"]>,
): AttachmentDTO {
  const att = a as AttachmentDoc;
  return {
    id: att._id.toHexString(),
    filename: att.filename,
    contentType: att.contentType,
    size: att.size,
    disposition: att.disposition,
    embedded: att.embedded,
    available: att.availability !== "unavailable",
    downloadUrl: attachmentDownloadPath(att._id),
    thumbnailUrl: null,
  };
}

async function toDraftDTO(doc: DraftDoc): Promise<DraftDTO> {
  const attachments = doc.attachmentIds.length
    ? await AttachmentModel.find({ _id: { $in: doc.attachmentIds }, orgId: doc.orgId }).sort({
        _id: 1,
      })
    : [];
  return {
    id: doc._id.toHexString(),
    senderId: hex(doc.senderId),
    threadId: hex(doc.threadId),
    inReplyToEmailId: hex(doc.inReplyToEmailId),
    to: doc.to,
    cc: doc.cc,
    bcc: doc.bcc,
    subject: doc.subject,
    mode: doc.mode,
    bodyHtml: doc.bodyHtml,
    bodyText: doc.bodyText,
    templateId: hex(doc.templateId),
    templateVariables: (doc.templateVariables ?? {}) as Record<string, unknown>,
    attachments: attachments.map(toAttachmentDTO),
    scheduledAt: doc.scheduledAt?.toISOString() ?? null,
    updatedAt: doc.updatedAt.toISOString(),
    version: versionOf(doc),
  };
}

async function ownDraft(ctx: OrgContext, id: string): Promise<DraftDoc> {
  if (!Types.ObjectId.isValid(id)) throw new ServiceError("not_found", "Draft not found.");
  const draft = await DraftModel.findOne({ _id: id, orgId: orgOid(ctx), userId: userOid(ctx) });
  if (!draft) throw new ServiceError("not_found", "Draft not found.");
  return draft;
}

/**
 * Autosave (DBD §4.3, TRD §2.12). Without `id` creates a draft. With `id`, `version` must be the
 * one returned by the previous save; a stale save is a `conflict` and nothing is written.
 */
export async function saveDraft(ctx: OrgContext, raw: SaveDraftInput): Promise<DraftDTO> {
  authorize(ctx, "email:send");
  const input = saveDraftInput.parse(raw);
  await connectDb();
  const orgId = orgOid(ctx);

  await assertRefs(orgId, [
    { model: SenderModel, ids: [input.senderId ? new Types.ObjectId(input.senderId) : null] },
    { model: ThreadModel, ids: [input.threadId ? new Types.ObjectId(input.threadId) : null] },
    {
      model: EmailModel,
      ids: [input.inReplyToEmailId ? new Types.ObjectId(input.inReplyToEmailId) : null],
    },
  ]);

  const fields: Record<string, unknown> = {};
  for (const key of [
    "senderId",
    "threadId",
    "inReplyToEmailId",
    "to",
    "cc",
    "bcc",
    "subject",
    "mode",
    "bodyHtml",
    "bodyText",
    "templateId",
    "templateVariables",
    "scheduledAt",
  ] as const) {
    if (input[key] !== undefined) fields[key] = input[key];
  }

  if (!input.id) {
    const created = await DraftModel.create({ orgId, userId: userOid(ctx), ...fields });
    return toDraftDTO(created);
  }

  const draft = await ownDraft(ctx, input.id);
  if (input.version === undefined || versionOf(draft) !== input.version) throw conflict();
  draft.set(fields);
  try {
    await draft.save();
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") throw conflict();
    throw error;
  }
  return toDraftDTO(draft);
}

export async function getDraft(ctx: OrgContext, id: string): Promise<DraftDTO> {
  authorize(ctx, "email:send");
  await connectDb();
  return toDraftDTO(await ownDraft(ctx, id));
}

/** The caller's own drafts, most recently edited first. */
export async function listDrafts(ctx: OrgContext): Promise<DraftDTO[]> {
  authorize(ctx, "email:send");
  await connectDb();
  const drafts = await DraftModel.find({ orgId: orgOid(ctx), userId: userOid(ctx) })
    .sort({ updatedAt: -1 })
    .limit(100);
  return Promise.all(drafts.map(toDraftDTO));
}

/** Removes a draft, its attachment records and their uploaded objects. */
export async function deleteDraft(ctx: OrgContext, id: string): Promise<void> {
  authorize(ctx, "email:send");
  await connectDb();
  const draft = await ownDraft(ctx, id);
  await purgeDraftAttachments(draft._id, draft.orgId);
  await DraftModel.deleteOne({ _id: draft._id, orgId: draft.orgId });
}

export async function purgeDraftAttachments(draftId: Types.ObjectId, orgId: Types.ObjectId) {
  const attachments = await AttachmentModel.find({ orgId, draftId, emailId: null }).lean();
  const keys = attachments.flatMap((a) => (a.storageKey ? [a.storageKey] : []));
  if (keys.length) await getStore().delete(keys);
  await AttachmentModel.deleteMany({ orgId, draftId, emailId: null });
}

/* ------------------------------------------------------------------------------------------ */
/* Draft attachments: browser -> R2 with a presigned PUT (TRD §2.13)                           */
/* ------------------------------------------------------------------------------------------ */

async function draftBytes(orgId: Types.ObjectId, draftId: Types.ObjectId) {
  const rows = await AttachmentModel.aggregate<{ total: number }>([
    { $match: { orgId, draftId, emailId: null, uploadStatus: { $ne: "failed" } } },
    { $group: { _id: null, total: { $sum: "$size" } } },
  ]);
  return rows[0]?.total ?? 0;
}

/** Checks limits and returns a 5-minute upload URL with signed size and type. */
export async function createAttachmentUpload(
  ctx: OrgContext,
  input: { draftId: string; filename: string; size: number; contentType: string },
): Promise<{ attachmentId: string; uploadUrl: string; headers: Record<string, string> }> {
  authorize(ctx, "email:send");
  await connectDb();
  const draft = await ownDraft(ctx, input.draftId);
  const size = Math.floor(input.size);
  if (!Number.isFinite(size) || size <= 0)
    throw new ServiceError("validation", "The file is empty.");
  if (size > MAX_ATTACHMENT_BYTES) {
    throw new ServiceError("attachment_too_large", "Attachments can be at most 40 MB.");
  }
  if ((await draftBytes(draft.orgId, draft._id)) + size > MAX_EMAIL_BYTES) {
    throw new ServiceError(
      "attachment_too_large",
      "An email can carry at most 40 MB of attachments.",
    );
  }
  const contentType = (input.contentType || "application/octet-stream").slice(0, 200);
  const id = new Types.ObjectId();
  const key = storageKeys.draftUpload(draft.orgId, draft._id, id);
  await AttachmentModel.create({
    _id: id,
    orgId: draft.orgId,
    draftId: draft._id,
    emailId: null,
    uploadedBy: userOid(ctx),
    direction: "outbound",
    filename: sanitizeFilename(input.filename),
    contentType,
    size,
    storageMode: "r2",
    storageKey: key,
    uploadStatus: "pending",
  });
  const { url, headers } = await presignUpload(key, { contentType, size });
  return { attachmentId: id.toHexString(), uploadUrl: url, headers };
}

/** `HeadObject` check after the browser upload; only then the file becomes part of the draft. */
export async function confirmAttachmentUpload(
  ctx: OrgContext,
  input: { draftId: string; attachmentId: string },
): Promise<AttachmentDTO> {
  authorize(ctx, "email:send");
  await connectDb();
  const draft = await ownDraft(ctx, input.draftId);
  const attachment = await AttachmentModel.findOne({
    _id: Types.ObjectId.isValid(input.attachmentId) ? input.attachmentId : new Types.ObjectId(),
    orgId: draft.orgId,
    draftId: draft._id,
    emailId: null,
  });
  if (!attachment?.storageKey) throw new ServiceError("not_found", "Attachment not found.");
  const head = await getStore().head(attachment.storageKey);
  const okType =
    !!head &&
    (!head.contentType || head.contentType.split(";")[0] === attachment.contentType.split(";")[0]);
  if (!head || head.size !== attachment.size || !okType) {
    attachment.uploadStatus = "failed";
    await attachment.save();
    await getStore().delete([attachment.storageKey]);
    throw new ServiceError(
      "upload_failed",
      "The upload didn't complete. Try attaching the file again.",
    );
  }
  attachment.uploadStatus = "stored";
  await attachment.save();
  await DraftModel.updateOne(
    { _id: draft._id, orgId: draft.orgId },
    { $addToSet: { attachmentIds: attachment._id } },
  );
  return toAttachmentDTO(attachment);
}

export async function removeDraftAttachment(
  ctx: OrgContext,
  input: { draftId: string; attachmentId: string },
): Promise<void> {
  authorize(ctx, "email:send");
  await connectDb();
  const draft = await ownDraft(ctx, input.draftId);
  if (!Types.ObjectId.isValid(input.attachmentId)) return;
  const attachment = await AttachmentModel.findOneAndDelete({
    _id: input.attachmentId,
    orgId: draft.orgId,
    draftId: draft._id,
    emailId: null,
  });
  if (attachment?.storageKey) await getStore().delete([attachment.storageKey]);
  await DraftModel.updateOne(
    { _id: draft._id, orgId: draft.orgId },
    { $pull: { attachmentIds: new Types.ObjectId(input.attachmentId) } },
  );
}
