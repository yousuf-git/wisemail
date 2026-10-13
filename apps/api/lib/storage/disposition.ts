/** Pure `Content-Disposition` helpers (no imports, so stores and presign can share them). */

/** Only these render inline; anything else (including SVG, which can script) is forced to download. */
export const INLINE_IMAGE_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
]);

export const isInlineImageType = (contentType: string) =>
  INLINE_IMAGE_TYPES.has(contentType.split(";")[0]!.trim().toLowerCase());

/**
 * `Content-Disposition` with an ASCII fallback and the exact UTF-8 name (RFC 6266 / 5987).
 * The original name is kept apart from path separators and control characters, which are
 * removed before the header is built.
 */
export function contentDisposition(type: "inline" | "attachment", filename?: string): string {
  if (!filename) return type;
  const clean = filename.replace(/[\\/]/g, "").replace(/[\u0000-\u001f\u007f]/g, "");
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(clean).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
