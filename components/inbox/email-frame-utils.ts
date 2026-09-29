/**
 * The email body renders in an iframe that has NO `allow-scripts` and NO `allow-same-origin`
 * (TRD §3), so the parent cannot measure the document inside and the frame cannot resize
 * itself. We therefore size it from an estimate of the HTML and let the frame scroll
 * internally, with an Expand toggle for long messages.
 */
export const EMAIL_FRAME_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";
export const EMAIL_FRAME_CSP =
  "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'";
export const EMAIL_FRAME_REFERRER_POLICY = "no-referrer";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Complete document for `srcDoc`. `html` is already sanitized on the server; the CSP meta is
 * the second line of defense (no scripts, no network except https images). Links open in a new
 * tab (`<base target>` + `allow-popups`). The page is light on purpose: emails are authored for
 * white backgrounds.
 */
export function buildEmailSrcDoc(
  body: { html?: string | null; text?: string | null },
  options: { allowLocalImages?: boolean } = {},
): string {
  // Development only: the fake object store serves images over http://localhost.
  const csp = options.allowLocalImages
    ? EMAIL_FRAME_CSP.replace("img-src https: data:", "img-src https: data: http://localhost:*")
    : EMAIL_FRAME_CSP;
  const content =
    body.html != null && body.html !== ""
      ? body.html
      : `<pre class="wm-plain">${escapeHtml(body.text ?? "")}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="${EMAIL_FRAME_REFERRER_POLICY}"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank"><style>html{color-scheme:light}body{margin:0;padding:14px 16px;background:#fff;color:#1f1e1c;font:14px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#0369a1}table{max-width:100%}.wm-plain{margin:0;font:inherit;white-space:pre-wrap}</style></head><body>${content}</body></html>`;
}

/** Rough content height in px: text lines + block breaks + images, clamped to a comfortable range. */
export function estimateFrameHeight(body: { html?: string | null; text?: string | null }): number {
  const html = body.html ?? "";
  const source = html || body.text || "";
  const text = html
    ? html
        .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;|&#160;/g, " ")
    : source;
  const charsPerLine = 80;
  const textLines = text
    .split(/\n/)
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.trim().length / charsPerLine)), 0);
  const blocks = html ? (html.match(/<(br|p|div|tr|li|h[1-6]|blockquote)\b/gi)?.length ?? 0) : 0;
  const images = html ? (html.match(/<img\b/gi)?.length ?? 0) : 0;
  const lines = html ? Math.ceil(text.trim().length / charsPerLine) + blocks * 0.6 : textLines;
  const px = 44 + lines * 22 + images * 140;
  return Math.round(Math.min(Math.max(px, 120), 900));
}
