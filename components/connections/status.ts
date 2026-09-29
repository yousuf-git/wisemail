import type { StatusState } from "@/components/app/status-chip";
import type { ConnectionStatus } from "@/lib/db/models/connections";

export const CONNECTION_STATUS: Record<ConnectionStatus, { label: string; state: StatusState }> = {
  provisioning: { label: "Setting up", state: "info" },
  active: { label: "Active", state: "success" },
  needs_attention: { label: "Needs attention", state: "warning" },
  read_only: { label: "Read only", state: "neutral" },
  disabled: { label: "Disabled", state: "neutral" },
};

/** "just now", "5 minutes ago", "3 days ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return "just now";
  const units: [number, string][] = [
    [60 * 60 * 24, "day"],
    [60 * 60, "hour"],
    [60, "minute"],
  ];
  for (const [size, unit] of units) {
    if (seconds >= size) {
      const n = Math.round(seconds / size);
      return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}
