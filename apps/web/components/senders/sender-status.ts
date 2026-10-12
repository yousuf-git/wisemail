import type { StatusState } from "@/components/app/status-chip";
import type { SenderDTO } from "@/lib/dto/mail";

/** Client-safe copy for sender health (mirrors `lib/services/senders.ts`, which is server-only). */
const REASONS: Record<string, string> = {
  domain_deleted_in_resend: "The domain was removed from Resend.",
  domain_failed: "The domain failed verification in Resend.",
  domain_not_started: "The domain isn't set up in Resend yet.",
  domain_pending: "The domain is still verifying in Resend.",
  domain_partially_verified: "The domain is only partly verified in Resend.",
  domain_partially_failed: "The domain is only partly verified in Resend.",
  resend_rejected_domain: "Resend refused to send from this domain.",
  key_revoked: "The connection's API key was revoked.",
  connection_read_only: "The connection is read-only.",
  connection_removed: "The connection was removed.",
};

export const STATUS_LABEL: Record<SenderDTO["status"], string> = {
  active: "Active",
  domain_unverified: "Domain not verified",
  connection_inactive: "Connection needs attention",
  disabled: "Disabled",
};

export const STATUS_STATE: Record<SenderDTO["status"], StatusState> = {
  active: "success",
  domain_unverified: "warning",
  connection_inactive: "warning",
  disabled: "neutral",
};

export function senderReason(sender: Pick<SenderDTO, "status" | "statusReason">): string | null {
  if (sender.status === "active") return null;
  if (sender.status === "disabled") return "Turned off by a member.";
  const reason = sender.statusReason;
  if (reason && REASONS[reason]) return REASONS[reason]!;
  if (reason) return `${reason.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}.`;
  return STATUS_LABEL[sender.status];
}

export const senderLabel = (sender: Pick<SenderDTO, "address" | "displayName">) =>
  sender.displayName ? `${sender.displayName} <${sender.address}>` : sender.address;
