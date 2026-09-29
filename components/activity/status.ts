import type { StatusState } from "@/components/app/status-chip";
import type { EmailStatus } from "@/lib/db/models/emails";

/** Email states and their semantic colors (FED §2.2). Never color-only: every state has a label. */
const MAP: Record<EmailStatus, { state: StatusState; label: string }> = {
  draft: { state: "neutral", label: "Draft" },
  queued: { state: "info", label: "Queued" },
  scheduled: { state: "info", label: "Scheduled" },
  sent: { state: "info", label: "Sent" },
  delivered: { state: "success", label: "Delivered" },
  delivery_delayed: { state: "warning", label: "Delivery delayed" },
  opened: { state: "engaged", label: "Opened" },
  clicked: { state: "engaged", label: "Clicked" },
  bounced: { state: "danger", label: "Bounced" },
  complained: { state: "danger", label: "Complained" },
  failed: { state: "danger", label: "Failed" },
  suppressed: { state: "neutral", label: "Suppressed" },
  canceled: { state: "neutral", label: "Canceled" },
  received: { state: "success", label: "Received" },
};

export const statusState = (status: EmailStatus): StatusState => MAP[status].state;
export const statusLabel = (status: EmailStatus): string => MAP[status].label;

/** Webhook event type -> label for timelines ("email.delivery_delayed" -> "Delivery delayed"). */
export function eventLabel(type: string): string {
  const key = type.replace(/^email\./, "") as EmailStatus;
  if (key in MAP) return MAP[key].label;
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function eventState(type: string): StatusState {
  const key = type.replace(/^email\./, "") as EmailStatus;
  return key in MAP ? MAP[key].state : "neutral";
}

/** Filter options for the Activity status select. */
export const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "delivered", label: "Delivered" },
  { value: "opened,clicked", label: "Opened or clicked" },
  { value: "sent,queued", label: "Sent" },
  { value: "scheduled", label: "Scheduled" },
  { value: "delivery_delayed", label: "Delivery delayed" },
  { value: "bounced,complained,failed", label: "Bounced or failed" },
  { value: "suppressed,canceled", label: "Suppressed or canceled" },
  { value: "received", label: "Received" },
];
