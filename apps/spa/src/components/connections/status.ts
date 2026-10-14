export const CONNECTION_STATUS: Record<
  string,
  { label: string; state: "success" | "warning" | "danger" | "neutral" | "info" }
> = {
  active: { label: "Active", state: "success" },
  provisioning: { label: "Setting up", state: "info" },
  needs_attention: { label: "Needs attention", state: "warning" },
  read_only: { label: "Read only", state: "neutral" },
  disabled: { label: "Disabled", state: "danger" },
};

export const STATUS_REASON_COPY: Record<string, string> = {
  webhook_slot_unavailable:
    "Your Resend account has no free webhook slot, so Wisemail can't listen for events yet. Delete an unused webhook in Resend → Webhooks (Resend Pro allows 5, Scale 10), then retry.",
  webhook_registration_failed:
    "We couldn't register our webhook with Resend. Check that the key still has full access, then retry.",
  key_revoked:
    "Resend no longer accepts this key. Create a new Full access key in Resend → API Keys.",
  over_plan_limit:
    "This workspace is over its plan's connection limit. Events still arrive; sending and changes are paused.",
};

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

export function summarizeChecklist(items: readonly { status: string }[]) {
  return {
    ok: items.filter((i) => i.status === "ok").length,
    warn: items.filter((i) => i.status === "warn").length,
    fail: items.filter((i) => i.status === "fail").length,
    total: items.length,
  };
}
