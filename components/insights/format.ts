import type { RateKey } from "@/lib/services/insights-math";

/** `2026-09-29` -> `Sep 29` (calendar date, no time zone shifts). */
export function shortDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export const formatCount = (n: number) => n.toLocaleString("en-US");

/** Percent with one decimal, trimming `.0`; `-` when there is no denominator. */
export function formatRate(value: number | null, digits = 1): string {
  if (value === null) return "–";
  const fixed = value.toFixed(digits);
  return `${fixed.replace(/\.0+$/, "")}%`;
}

export const RATE_LABELS: Record<RateKey, string> = {
  delivered: "Delivered",
  opened: "Opened (est.)",
  clicked: "Clicked",
  bounced: "Bounced",
  complained: "Complaints",
};

export const OPEN_ESTIMATE_NOTE =
  "Open rates are pixel based and inflated by Apple Mail Privacy Protection and image proxies, so treat them as estimates.";

/** PRD §5.5 guidelines. */
export const BOUNCE_GUIDELINE = 4;
export const COMPLAINT_GUIDELINE = 0.08;
