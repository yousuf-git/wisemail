import type { EmailStatus } from "@/lib/db/models/emails";

/**
 * Email status ranking (TRD §2.1): events can arrive out of order, so an email keeps the
 * highest-ranked state it has seen. Failure outcomes outrank delivery progress, a complaint
 * outranks a bounce. `received` is the only inbound state and never competes.
 */
export const STATUS_RANK: Record<EmailStatus, number> = {
  draft: 0,
  received: 0,
  queued: 1,
  scheduled: 2,
  sent: 3,
  delivery_delayed: 4,
  delivered: 5,
  opened: 6,
  clicked: 7,
  failed: 8,
  suppressed: 8,
  canceled: 8,
  bounced: 9,
  complained: 10,
};

/** The status an email should have after seeing `incoming` while at `current`. */
export function nextStatus(current: EmailStatus | null | undefined, incoming: EmailStatus) {
  if (!current) return incoming;
  return STATUS_RANK[incoming] > STATUS_RANK[current] ? incoming : current;
}

/** Webhook event type -> the status it implies (events that imply none are absent). */
export const EVENT_STATUS: Record<string, EmailStatus> = {
  "email.scheduled": "scheduled",
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
  "email.received": "received",
};

/** Statuses that mean "still waiting to go out" (cancelable, reschedulable, flaggable). */
export const PENDING_STATUSES: readonly EmailStatus[] = ["queued", "scheduled"];
