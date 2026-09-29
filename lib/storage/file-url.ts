import "server-only";

import type { AttachmentDoc } from "@/lib/db/models/attachments";
import { isInlineImageType, presignDownload, presignInline } from "./presign";

/**
 * URLs for an attachment in one of two purposes, handling both storage modes (TRD §2.13):
 *
 * | Purpose    | `r2`                                    | `resend`                                   |
 * | inline     | presigned GET, 15 min, `inline` (images)| cached Resend URL, refreshed near expiry   |
 * | download   | presigned GET, 5 min, `attachment`      | <= 4 MB streamed by our route, else Resend |
 */

/** Files up to this size are proxied through our route in `resend` mode so the name is exact. */
export const STREAM_LIMIT_BYTES = 4 * 1024 * 1024;
/** A cached Resend URL is reused while more than this far from `expires_at`. */
export const RESEND_URL_MARGIN_MS = 2 * 60 * 1000;

export type ResendDownload = { url: string; expiresAt: Date };

export type FileUrlDeps = {
  /** Asks Resend for a fresh download URL (`emails.receiving.attachments.get`); null when gone. */
  refreshResendDownload?: (attachment: AttachmentDoc) => Promise<ResendDownload | null>;
  /** Downloads a Resend-hosted file (for streaming small files). */
  fetchResendFile?: (url: string) => Promise<Buffer>;
  now?: () => number;
};

type AttachmentLike = Pick<
  AttachmentDoc,
  | "storageMode"
  | "storageKey"
  | "filename"
  | "contentType"
  | "size"
  | "availability"
  | "resendDownload"
>;

export type DownloadTarget =
  | { kind: "redirect"; url: string }
  | { kind: "stream"; body: Buffer; contentType: string; filename: string }
  | { kind: "unavailable" };

/** The cached Resend URL if it is still fresh, else a refreshed (and cached by the caller) one. */
export async function resendUrl(
  attachment: AttachmentDoc,
  deps: FileUrlDeps,
): Promise<ResendDownload | null> {
  const now = (deps.now ?? Date.now)();
  const cached = attachment.resendDownload;
  if (cached && cached.expiresAt.getTime() - now > RESEND_URL_MARGIN_MS) return cached;
  return deps.refreshResendDownload ? deps.refreshResendDownload(attachment) : null;
}

/** URL for showing an embedded image (or thumbnail) in the message view; null when unavailable. */
export async function inlineUrl(
  attachment: AttachmentDoc,
  deps: FileUrlDeps = {},
): Promise<string | null> {
  if (attachment.availability === "unavailable") return null;
  if (attachment.storageMode === "r2" && attachment.storageKey) {
    return presignInline(attachment.storageKey, attachment);
  }
  if (attachment.storageMode === "resend") {
    return (await resendUrl(attachment, deps))?.url ?? null;
  }
  return null;
}

/** What the files route should do for a download click. */
export async function downloadTarget(
  attachment: AttachmentDoc,
  deps: FileUrlDeps = {},
): Promise<DownloadTarget> {
  if (attachment.availability === "unavailable") return { kind: "unavailable" };
  if (attachment.storageMode === "r2" && attachment.storageKey) {
    return { kind: "redirect", url: await presignDownload(attachment.storageKey, attachment) };
  }
  if (attachment.storageMode === "resend") {
    const fresh = await resendUrl(attachment, deps);
    if (!fresh) return { kind: "unavailable" };
    if (attachment.size <= STREAM_LIMIT_BYTES && deps.fetchResendFile) {
      return {
        kind: "stream",
        body: await deps.fetchResendFile(fresh.url),
        contentType: attachment.contentType,
        filename: attachment.filename,
      };
    }
    return { kind: "redirect", url: fresh.url };
  }
  return { kind: "unavailable" };
}

export const isImageAttachment = (attachment: Pick<AttachmentLike, "contentType">) =>
  isInlineImageType(attachment.contentType);
