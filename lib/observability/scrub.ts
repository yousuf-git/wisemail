import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * PII scrubbing for Sentry (TRD §1 Observability). Pure and dependency-free so the client, server
 * and tests share it. We never want email bodies, addresses, headers, cookies, credentials or API
 * keys in an error report; ids (orgId, digest, route) are enough to debug.
 */

const REDACTED = "[redacted]";

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|apikey|signature|svix|bearer|credential|session|kek|dsn|^(html|text|body|rawbody|content|subject|preview|snippet|markdown|mime|raw)$|^(to|cc|bcc|from|reply[-_]?to|email|recipient|recipients|sender)$/i;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const KEYS =
  /\b(re_[A-Za-z0-9_]{8,}|sk_(?:live|test)_[A-Za-z0-9]+|rk_(?:live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9+/=]+)\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

export function scrubString(value: string): string {
  return value.replace(EMAIL, "[email]").replace(KEYS, "[key]").replace(BEARER, "Bearer [token]");
}

export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > 6) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrubValue(inner, depth + 1);
  }
  return out;
}

function scrubUrl(url: string): string {
  try {
    const u = new URL(url, "http://local");
    // Keep the path (it carries ids at most), drop query and fragment: they may hold tokens.
    const path = scrubString(u.pathname);
    return /^https?:\/\//.test(url) ? `${u.origin}${path}` : path;
  } catch {
    return scrubString(url.split(/[?#]/)[0] ?? "");
  }
}

/** `beforeSend` for every runtime. Returns the event with request data, user and free text scrubbed. */
export function scrubEvent<T extends ErrorEvent>(event: T, _hint?: EventHint): T | null {
  if (event.request) {
    const req = event.request;
    if (req.url) req.url = scrubUrl(req.url);
    delete req.headers;
    delete req.cookies;
    delete req.data;
    delete req.query_string;
  }
  // Only an opaque id may identify a person; never email, name or IP.
  if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : undefined;

  if (event.message) event.message = scrubString(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubString(ex.value);
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = scrubString(crumb.message);
    if (crumb.data) {
      const data = scrubValue(crumb.data) as Record<string, unknown>;
      if (typeof data.url === "string") data.url = scrubUrl(data.url);
      crumb.data = data;
    }
  }
  if (event.extra) event.extra = scrubValue(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = scrubValue(event.contexts) as typeof event.contexts;
  if (event.tags) {
    // Tags are ids and flags; drop anything that looks like personal data.
    for (const [k, v] of Object.entries(event.tags)) {
      if (typeof v === "string" && (EMAIL.test(v) || SENSITIVE_KEY.test(k))) delete event.tags[k];
      EMAIL.lastIndex = 0;
    }
  }
  return event;
}

/** Breadcrumb hook: drop request bodies and headers captured by fetch/xhr instrumentation. */
export function scrubBreadcrumb<T extends { data?: Record<string, unknown>; message?: string }>(
  crumb: T,
): T {
  if (crumb.message) crumb.message = scrubString(crumb.message);
  if (crumb.data) {
    const data = scrubValue(crumb.data) as Record<string, unknown>;
    if (typeof data.url === "string") data.url = scrubUrl(data.url);
    crumb.data = data;
  }
  return crumb;
}
