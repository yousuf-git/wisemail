import type { Sender, SenderStatus } from "@/lib/api";

/** Client-safe copy for sender health (mirrors `lib/services/senders.ts`). */
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

export const STATUS_LABEL: Record<SenderStatus, string> = {
  active: "Active",
  domain_unverified: "Domain not verified",
  connection_inactive: "Connection needs attention",
  disabled: "Disabled",
};

export const STATUS_TONE: Record<SenderStatus, string> = {
  active: "bg-success-soft text-success-ink",
  domain_unverified: "bg-warning-soft text-warning-ink",
  connection_inactive: "bg-warning-soft text-warning-ink",
  disabled: "bg-canvas-sunken text-ink-muted",
};

export function senderReason(sender: Pick<Sender, "status" | "statusReason">): string | null {
  if (sender.status === "active") return null;
  if (sender.status === "disabled") return "Turned off by a member.";
  const reason = sender.statusReason;
  if (reason && REASONS[reason]) return REASONS[reason]!;
  if (reason) return `${reason.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}.`;
  return STATUS_LABEL[sender.status];
}
