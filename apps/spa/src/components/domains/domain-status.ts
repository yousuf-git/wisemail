import type { DnsVerdict } from "@/lib/api";

export const DOMAIN_STATUS: Record<string, { label: string; tone: string }> = {
  verified: { label: "Verified", tone: "bg-success-soft text-success-ink" },
  pending: { label: "Pending DNS", tone: "bg-info-soft text-info-ink" },
  not_started: { label: "Not started", tone: "bg-canvas-sunken text-ink-muted" },
  partially_verified: { label: "Partly verified", tone: "bg-warning-soft text-warning-ink" },
  partially_failed: { label: "Partly failed", tone: "bg-warning-soft text-warning-ink" },
  temporary_failure: { label: "Temporary failure", tone: "bg-warning-soft text-warning-ink" },
  failed: { label: "Failed", tone: "bg-danger-soft text-danger-ink" },
};

export const domainStatus = (status: string) =>
  DOMAIN_STATUS[status] ?? {
    label: status.replace(/_/g, " "),
    tone: "bg-canvas-sunken text-ink-muted",
  };

export const RECORD_STATUS: Record<string, { label: string; tone: string }> = {
  verified: { label: "Verified", tone: "bg-success-soft text-success-ink" },
  pending: { label: "Pending", tone: "bg-info-soft text-info-ink" },
  not_started: { label: "Not started", tone: "bg-canvas-sunken text-ink-muted" },
  failed: { label: "Failed", tone: "bg-danger-soft text-danger-ink" },
  temporary_failure: { label: "Temporary failure", tone: "bg-warning-soft text-warning-ink" },
};

export const recordStatus = (status: string) =>
  RECORD_STATUS[status] ?? {
    label: status.replace(/_/g, " "),
    tone: "bg-canvas-sunken text-ink-muted",
  };

export const VERDICT: Record<DnsVerdict, { label: string; tone: string; dot: string }> = {
  pass: { label: "Found", tone: "bg-success-soft text-success-ink", dot: "bg-success" },
  fail: { label: "Different", tone: "bg-danger-soft text-danger-ink", dot: "bg-danger" },
  missing: { label: "Missing", tone: "bg-danger-soft text-danger-ink", dot: "bg-danger" },
  unknown: { label: "Couldn't check", tone: "bg-canvas-sunken text-ink-muted", dot: "bg-neutral" },
  skipped: { label: "Not needed", tone: "bg-canvas-sunken text-ink-muted", dot: "bg-neutral" },
};

export const CHECK_LABELS = {
  spf: "SPF",
  dkim: "DKIM",
  dmarc: "DMARC",
  mx: "MX (receiving)",
} as const;

export const GROUP_LABEL: Record<string, string> = {
  SPF: "SPF (sending)",
  DKIM: "DKIM (signing)",
  Receiving: "MX (receiving)",
  Tracking: "Tracking",
  TrackingCAA: "Tracking CAA",
};

export const REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "eu-west-1", label: "EU West (Ireland)" },
  { value: "sa-east-1", label: "South America (São Paulo)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
] as const;

export function needsAttention(d: {
  status: string;
  dnsCheck: { spf: DnsVerdict; dkim: DnsVerdict } | null;
}) {
  const c = d.dnsCheck;
  return (
    d.status !== "verified" ||
    (!!c && (c.spf === "fail" || c.spf === "missing" || c.dkim === "fail" || c.dkim === "missing"))
  );
}
