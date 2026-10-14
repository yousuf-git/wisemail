import type { StatusState } from "@/components/app/status-chip";

const EMAIL_STATUSES = [
  "draft",
  "queued",
  "scheduled",
  "sent",
  "delivered",
  "delivery_delayed",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "failed",
  "suppressed",
  "canceled",
  "received",
] as const;

export type EmailStatus = (typeof EMAIL_STATUSES)[number];

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

function asStatus(status: string): EmailStatus | null {
  return (EMAIL_STATUSES as readonly string[]).includes(status) ? (status as EmailStatus) : null;
}

export const statusState = (status: string): StatusState =>
  asStatus(status) ? MAP[asStatus(status)!].state : "neutral";

export const statusLabel = (status: string): string =>
  asStatus(status) ? MAP[asStatus(status)!].label : status.replace(/_/g, " ");

export function eventLabel(type: string): string {
  const key = type.replace(/^email\./, "");
  if (asStatus(key)) return MAP[asStatus(key)!].label;
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function eventState(type: string): StatusState {
  const key = type.replace(/^email\./, "");
  return asStatus(key) ? MAP[asStatus(key)!].state : "neutral";
}

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
