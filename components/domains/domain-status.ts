import type { StatusState } from "@/components/app/status-chip";
import type { DnsVerdictValue } from "@/lib/dto/domain";

export const DOMAIN_STATUS: Record<string, { label: string; state: StatusState }> = {
  verified: { label: "Verified", state: "success" },
  pending: { label: "Pending DNS", state: "info" },
  not_started: { label: "Not started", state: "neutral" },
  partially_verified: { label: "Partly verified", state: "warning" },
  partially_failed: { label: "Partly failed", state: "warning" },
  temporary_failure: { label: "Temporary failure", state: "warning" },
  failed: { label: "Failed", state: "danger" },
};

export const domainStatus = (status: string) =>
  DOMAIN_STATUS[status] ?? { label: status.replace(/_/g, " "), state: "neutral" as StatusState };

/** Per-record status Resend reports. */
export const RECORD_STATUS: Record<string, { label: string; state: StatusState }> = {
  verified: { label: "Verified", state: "success" },
  pending: { label: "Pending", state: "info" },
  not_started: { label: "Not started", state: "neutral" },
  failed: { label: "Failed", state: "danger" },
  temporary_failure: { label: "Temporary failure", state: "warning" },
};

export const recordStatus = (status: string) =>
  RECORD_STATUS[status] ?? { label: status.replace(/_/g, " "), state: "neutral" as StatusState };

/** Our own DNS check verdicts. */
export const VERDICT: Record<DnsVerdictValue, { label: string; state: StatusState }> = {
  pass: { label: "Found", state: "success" },
  fail: { label: "Different", state: "danger" },
  missing: { label: "Missing", state: "danger" },
  unknown: { label: "Couldn't check", state: "neutral" },
  skipped: { label: "Not needed", state: "neutral" },
};

export const CHECK_LABELS = {
  spf: "SPF",
  dkim: "DKIM",
  dmarc: "DMARC",
  mx: "MX (receiving)",
} as const;

/** "Sep 12, 2026", stable between server and browser (UTC). */
export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
