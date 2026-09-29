import "server-only";

import { Webhook } from "svix";

import type { ResendEvent, ResendEventType } from "./types";

/** Every event type we register for and understand (Resend's full list as of `resend@6.30`). */
export const SUPPORTED_EVENT_TYPES = [
  "email.sent",
  "email.scheduled",
  "email.delivered",
  "email.delivery_delayed",
  "email.complained",
  "email.bounced",
  "email.opened",
  "email.clicked",
  "email.received",
  "email.failed",
  "email.suppressed",
  "contact.created",
  "contact.updated",
  "contact.deleted",
  "domain.created",
  "domain.updated",
  "domain.deleted",
  "suppression.added",
  "suppression.removed",
] as const satisfies readonly ResendEventType[];

// Compile-time exhaustiveness: fails if a ResendEventType is missing from the list above.
type Missing = Exclude<ResendEventType, (typeof SUPPORTED_EVENT_TYPES)[number]>;
const _exhaustive: [Missing] extends [never] ? true : never = true;
void _exhaustive;

const SUPPORTED = new Set<string>(SUPPORTED_EVENT_TYPES);
export const isSupportedEventType = (type: string): type is ResendEventType => SUPPORTED.has(type);

export type SvixHeaders = { id: string; timestamp: string; signature: string };

/** Reads the Svix headers (`svix-*`, or the standard-webhooks `webhook-*` aliases). */
export function readSvixHeaders(headers: Pick<Headers, "get">): SvixHeaders | null {
  const id = headers.get("svix-id") ?? headers.get("webhook-id");
  const timestamp = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const signature = headers.get("svix-signature") ?? headers.get("webhook-signature");
  return id && timestamp && signature ? { id, timestamp, signature } : null;
}

export type VerifyResult =
  { ok: true; svixId: string; event: ResendEvent } | { ok: false; reason: string };

/**
 * Verifies a webhook the way Resend signs it (Svix: HMAC over `id.timestamp.body`, 5-minute
 * timestamp tolerance) and parses the body. `rawBody` must be the exact bytes received. The fake
 * adapter signs with real Svix secrets too, so fake and live take the identical path.
 */
export function verifyWebhook(
  rawBody: string,
  headers: Pick<Headers, "get">,
  secret: string,
): VerifyResult {
  const svix = readSvixHeaders(headers);
  if (!svix) return { ok: false, reason: "missing_headers" };
  try {
    new Webhook(secret).verify(rawBody, {
      "svix-id": svix.id,
      "svix-timestamp": svix.timestamp,
      "svix-signature": svix.signature,
    });
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  try {
    const event = JSON.parse(rawBody) as ResendEvent;
    if (typeof event?.type !== "string" || typeof event.created_at !== "string" || !event.data) {
      return { ok: false, reason: "bad_payload" };
    }
    return { ok: true, svixId: svix.id, event };
  } catch {
    return { ok: false, reason: "bad_payload" };
  }
}

/** Signs a body as Resend would. Used by tests and `scripts/send-test-webhook.ts`. */
export function signWebhook(
  secret: string,
  body: string,
  options: { id?: string; timestamp?: Date } = {},
): Record<string, string> {
  const id = options.id ?? `msg_${crypto.randomUUID().replace(/-/g, "")}`;
  const timestamp = options.timestamp ?? new Date();
  return {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "svix-signature": new Webhook(secret).sign(id, timestamp, body),
  };
}
