import "server-only";

import mongoose, { Types } from "mongoose";

import { decryptSecret } from "@/lib/crypto/envelope";
import { connectDb } from "@/lib/db/connect";
import { isRole, roleHasPermission } from "@/lib/auth/permissions";
import { AttachmentModel, type AttachmentDoc } from "@/lib/db/models/attachments";
import { ConnectionModel } from "@/lib/db/models/connections";
import { DraftModel } from "@/lib/db/models/drafts";
import { EmailModel } from "@/lib/db/models/emails";
import { getResendAdapter } from "@/lib/resend/client-factory";
import { isResendError } from "@/lib/resend/errors";
import { contentDisposition } from "@/lib/storage/disposition";
import {
  downloadTarget,
  inlineUrl,
  type FileUrlDeps,
  type DownloadTarget,
} from "@/lib/storage/file-url";
import { canSeeProject, loadProjectScope } from "./project-scope";
import { keyAad } from "./webhook-secret";

/** Adapter for Resend-hosted files: refresh a download URL, or download a small file. */
async function adapterFor(attachment: AttachmentDoc) {
  if (!attachment.emailId) return null;
  const email = await EmailModel.findOne(
    { _id: attachment.emailId, orgId: attachment.orgId },
    { connectionId: 1, resendId: 1 },
  ).lean();
  if (!email?.resendId) return null;
  const connection = await ConnectionModel.findOne({
    _id: email.connectionId,
    orgId: attachment.orgId,
    deletedAt: null,
  });
  if (!connection?.apiKey) return null;
  return {
    adapter: getResendAdapter(decryptSecret(connection.apiKey, { aad: keyAad(connection._id) })),
    resendEmailId: email.resendId,
  };
}

/**
 * Resend mode (Free): refresh the cached download URL when it is near expiry. A 404 from Resend
 * marks the attachment `unavailable` ("No longer available at Resend").
 */
export function resendFileDeps(): FileUrlDeps {
  return {
    async refreshResendDownload(attachment) {
      const ctx = await adapterFor(attachment);
      if (!ctx || !attachment.resendAttachmentId) return null;
      try {
        const fresh = await ctx.adapter.getReceivedAttachment(
          ctx.resendEmailId,
          attachment.resendAttachmentId,
        );
        const resendDownload = { url: fresh.downloadUrl, expiresAt: new Date(fresh.expiresAt) };
        await AttachmentModel.updateOne(
          { _id: attachment._id, orgId: attachment.orgId },
          { $set: { resendDownload } },
        );
        return resendDownload;
      } catch (error) {
        if (isResendError(error) && error.code === "resend_not_found") {
          await AttachmentModel.updateOne(
            { _id: attachment._id, orgId: attachment.orgId },
            { $set: { availability: "unavailable" } },
          );
          return null;
        }
        throw error;
      }
    },
    async fetchResendFile(url) {
      // Any adapter can download a public URL; the fake resolves its own `fake://` links.
      return getResendAdapter("re_download").downloadFile(url, { maxBytes: 8 * 1024 * 1024 });
    },
  };
}

export const attachmentInlineUrl = (attachment: AttachmentDoc) =>
  inlineUrl(attachment, resendFileDeps());

export type AttachmentAccess =
  | { ok: true; attachment: AttachmentDoc; target: DownloadTarget }
  | { ok: false; reason: "not_found" | "forbidden" };

/**
 * Authorizes a file download (TRD §2.13, §3): the caller must be a member of the attachment's
 * org with permission to read its email or thread and, when project-scoped, access to its
 * project. Draft attachments belong to their uploader alone. Every refusal answers as
 * `not_found`, so ids from other orgs are indistinguishable from missing ones.
 */
export async function openAttachmentForUser(
  userId: string,
  attachmentId: string,
): Promise<AttachmentAccess> {
  if (!/^[0-9a-f]{24}$/i.test(attachmentId) || !/^[0-9a-f]{24}$/i.test(userId)) {
    return { ok: false, reason: "not_found" };
  }
  await connectDb();
  const attachment = await AttachmentModel.findById(attachmentId);
  if (!attachment) return { ok: false, reason: "not_found" };

  const member = await mongoose.connection
    .collection("member")
    .findOne({ organizationId: attachment.orgId, userId: new Types.ObjectId(userId) } as never);
  if (!member) return { ok: false, reason: "not_found" };
  const role = String(member.role)
    .split(",")
    .map((r) => r.trim())
    .find(isRole);
  if (!role) return { ok: false, reason: "not_found" };

  if (!attachment.emailId) {
    // Draft upload: only its uploader.
    const draft = attachment.draftId
      ? await DraftModel.findOne(
          { _id: attachment.draftId, orgId: attachment.orgId, userId: new Types.ObjectId(userId) },
          { _id: 1 },
        ).lean()
      : null;
    if (!draft && String(attachment.uploadedBy ?? "") !== userId)
      return { ok: false, reason: "not_found" };
    if (!roleHasPermission(role, "email:send")) return { ok: false, reason: "not_found" };
  } else {
    const email = await EmailModel.findOne(
      { _id: attachment.emailId, orgId: attachment.orgId },
      { projectId: 1, direction: 1 },
    ).lean();
    if (!email) return { ok: false, reason: "not_found" };
    const permitted =
      roleHasPermission(role, "email:read") ||
      (email.direction === "inbound" && roleHasPermission(role, "thread:read"));
    if (!permitted) return { ok: false, reason: "not_found" };
    const projectScope = await loadProjectScope({
      orgId: attachment.orgId.toHexString(),
      memberId: String(member._id),
      role,
    });
    if (!canSeeProject({ projectScope }, email.projectId?.toHexString() ?? null)) {
      return { ok: false, reason: "not_found" };
    }
  }

  const target = await downloadTarget(attachment, resendFileDeps());
  return { ok: true, attachment, target };
}

export { contentDisposition };
