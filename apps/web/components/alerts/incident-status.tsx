import { StatusChip, type StatusState } from "@/components/app/status-chip";
import type { IncidentDTO } from "@/lib/dto/alert";

const STATE: Record<IncidentDTO["status"], { state: StatusState; label: string }> = {
  open: { state: "danger", label: "Open" },
  acknowledged: { state: "warning", label: "Acknowledged" },
  resolved: { state: "success", label: "Resolved" },
};

export function IncidentStatus({ status }: { status: IncidentDTO["status"] }) {
  const { state, label } = STATE[status];
  return <StatusChip state={state}>{label}</StatusChip>;
}
