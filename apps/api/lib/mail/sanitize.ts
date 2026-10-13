import DOMPurify from "isomorphic-dompurify";

/**
 * Inbound (and composed) HTML sanitizer, TRD §2.4 step 4 and §3: strips scripts, forms, event
 * handlers, `<base>`, embeds and `javascript:` URLs; keeps inline styles; keeps `cid:` image
 * references (mapped to attachments at render time); remote `https` images stay, `http` images
 * are upgraded to `https`. The result is still rendered inside a sandboxed iframe with a strict
 * CSP: this is one layer of several.
 */

const FORBID_TAGS = [
  "script",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "option",
  "optgroup",
  "fieldset",
  "base",
  "meta",
  "link",
  "object",
  "embed",
  "iframe",
  "frame",
  "frameset",
  "applet",
  "noscript",
  "template",
  "dialog",
];

const FORBID_ATTR = ["formaction", "action", "srcdoc", "ping", "srcset", "autofocus"];

/** http(s), mailto, tel and cid only; `data:` is separately allowed for `<img>` by DOMPurify. */
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      if (node.hasAttribute("href")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      } else {
        node.removeAttribute("target");
      }
    }
    if (node.tagName === "IMG") {
      const src = node.getAttribute("src");
      if (src && /^http:\/\//i.test(src)) {
        node.setAttribute("src", src.replace(/^http:\/\//i, "https://"));
      }
      node.setAttribute("referrerpolicy", "no-referrer");
    }
    // Tracking-free `background` attributes and inline-style imports: drop remote CSS imports.
    const style = node.getAttribute?.("style");
    if (style && /@import|expression\s*\(|javascript:/i.test(style)) node.removeAttribute("style");
  });
  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName === "style" && node.textContent) {
      node.textContent = node.textContent.replace(/@import[^;]*;?/gi, "");
    }
  });
}

export function sanitizeEmailHtml(html: string): string {
  ensureHooks();
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS,
    FORBID_ATTR,
    ALLOWED_URI_REGEXP,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
    KEEP_CONTENT: true,
  });
}

/** `cid:` ids referenced by `src`/`background` attributes of sanitized HTML (lowercased). */
export function referencedContentIds(html: string): Set<string> {
  const ids = new Set<string>();
  for (const match of html.matchAll(/\bcid:([^"'\s>)]+)/gi)) {
    ids.add(decodeCid(match[1]!));
  }
  return ids;
}

export const normalizeContentId = (id: string) =>
  decodeCid(id.trim().replace(/^</, "").replace(/>$/, ""));

function decodeCid(value: string) {
  try {
    return decodeURIComponent(value).toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

/** Replaces each `cid:<id>` by `resolve(id)`; a missing image gets the placeholder. */
export function replaceContentIds(html: string, resolve: (cid: string) => string | null): string {
  return html.replace(/\bcid:([^"'\s>)]+)/gi, (whole, raw: string) => {
    const url = resolve(decodeCid(raw));
    return url ?? IMAGE_UNAVAILABLE;
  });
}

/** Tiny "Image unavailable" placeholder for a `cid:` reference without an attachment. */
export const IMAGE_UNAVAILABLE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32"><rect width="120" height="32" rx="6" fill="#eee"/><text x="60" y="20" font-family="sans-serif" font-size="11" fill="#777" text-anchor="middle">Image unavailable</text></svg>',
  );

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n\s*/g, "\n")
    .trim();
}

export function makeSnippet(text: string | null | undefined, length = 140): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1).trimEnd()}…` : flat;
}
