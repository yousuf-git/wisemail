import type { StatusState } from "@/components/app/status-chip";
import type { BroadcastStatus } from "@/lib/dto/audience";

const MAP: Record<BroadcastStatus, { label: string; state: StatusState }> = {
  draft: { label: "Draft", state: "neutral" },
  scheduled: { label: "Scheduled", state: "info" },
  queued: { label: "Queued", state: "info" },
  sending: { label: "Sending", state: "info" },
  sent: { label: "Sent", state: "success" },
  canceled: { label: "Canceled", state: "neutral" },
  failed: { label: "Failed", state: "danger" },
};

export const broadcastStatusLabel = (status: BroadcastStatus) => MAP[status]?.label ?? status;
export const broadcastStatusState = (status: BroadcastStatus): StatusState =>
  MAP[status]?.state ?? "neutral";
export const BROADCAST_STATUS_OPTIONS = (Object.keys(MAP) as BroadcastStatus[]).map((value) => ({
  value,
  label: MAP[value].label,
}));

export const percent = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";
