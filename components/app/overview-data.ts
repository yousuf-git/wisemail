/**
 * Overview numbers for the org dashboard.
 *
 * Placeholder: returns zeros and empty series until the rollup collections land.
 * Keep the shape stable so the page does not change when real data replaces it.
 */
export type OverviewKpiKey = "sent" | "delivered" | "opened" | "bounced";

export type OverviewKpi = {
  key: OverviewKpiKey;
  label: string;
  value: number;
  unit: "count" | "percent";
  /** Change versus the previous period, or null when there is nothing to compare. */
  delta: { value: number; goodWhen: "up" | "down"; suffix?: string } | null;
  /** Daily values, oldest first. */
  series: number[];
};

export type Overview = {
  /** True once at least one Resend connection is active. */
  hasConnection: boolean;
  /** True once any email event has been recorded. */
  hasData: boolean;
  periodLabel: string;
  kpis: OverviewKpi[];
};

export async function getOverview(orgSlug: string): Promise<Overview> {
  void orgSlug;
  return {
    hasConnection: false,
    hasData: false,
    periodLabel: "Last 7 days",
    kpis: [
      { key: "sent", label: "Sent", value: 0, unit: "count", delta: null, series: [] },
      { key: "delivered", label: "Delivered", value: 0, unit: "percent", delta: null, series: [] },
      { key: "opened", label: "Opened (est.)", value: 0, unit: "percent", delta: null, series: [] },
      { key: "bounced", label: "Bounced", value: 0, unit: "percent", delta: null, series: [] },
    ],
  };
}
