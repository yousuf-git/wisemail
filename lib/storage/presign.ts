import { isInlineImageType } from "./disposition";
import { getStore } from "./index";

export { INLINE_IMAGE_TYPES, contentDisposition, isInlineImageType } from "./disposition";

/** TRD §2.13 / §3 lifetimes. */
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
export const INLINE_URL_TTL_SECONDS = 15 * 60;
export const UPLOAD_URL_TTL_SECONDS = 5 * 60;
/** Resend fetches outbound attachments from this URL when the email is sent. */
export const SEND_URL_TTL_SECONDS = 60 * 60;

/** 5-minute download URL: `attachment` with the original name and type. */
export function presignDownload(key: string, file: { filename: string; contentType: string }) {
  return getStore().presignGet(key, {
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    disposition: "attachment",
    filename: file.filename,
    contentType: file.contentType,
  });
}

/** 15-minute inline URL for images embedded in a message; non-images are refused. */
export function presignInline(key: string, file: { filename: string; contentType: string }) {
  const disposition = isInlineImageType(file.contentType) ? "inline" : "attachment";
  return getStore().presignGet(key, {
    expiresIn: INLINE_URL_TTL_SECONDS,
    disposition,
    filename: disposition === "attachment" ? file.filename : undefined,
    contentType: file.contentType,
  });
}

/** Single-purpose upload URL: signed size and type, 5 minutes. */
export function presignUpload(key: string, file: { contentType: string; size: number }) {
  return getStore().presignPut(key, {
    expiresIn: UPLOAD_URL_TTL_SECONDS,
    contentType: file.contentType,
    size: file.size,
  });
}

/** 1-hour URL Resend fetches as an attachment `path`. */
export function presignForSend(key: string, file: { filename: string; contentType: string }) {
  return getStore().presignGet(key, {
    expiresIn: SEND_URL_TTL_SECONDS,
    disposition: "attachment",
    filename: file.filename,
    contentType: file.contentType,
  });
}
