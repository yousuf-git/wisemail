import type { Counts, Deltas, Rates } from "@/lib/services/insights-math";

export type InsightStream = "transactional" | "broadcast" | "inbound";
export const INSIGHT_RANGES = [7, 30, 90] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];

export type InsightFilters = {
  connectionId?: string;
  domainId?: string;
  projectId?: string;
  stream?: InsightStream;
};

export type InsightPoint = {
  /** Local calendar date `YYYY-MM-DD` (org time zone; UTC for the 90 day range). */
  date: string;
  counts: Counts;
  rates: Rates;
};

export type InsightDomainRow = {
  domainId: string | null;
  name: string;
  counts: Counts;
  rates: Rates;
  /** Daily bounce rate (percent), oldest first, aligned with `series`. */
  bounceTrend: number[];
};

export type InsightsDTO = {
  days: InsightRange;
  /** Zone the days are cut in; the 90 day range uses UTC daily buckets. */
  timezone: string;
  filters: InsightFilters;
  hasData: boolean;
  totals: Counts;
  rates: Rates;
  previous: { counts: Counts; rates: Rates };
  deltas: Deltas;
  series: InsightPoint[];
  domains: InsightDomainRow[];
  /** ISO time the numbers were read. */
  generatedAt: string;
};

export type InsightFilterOptions = {
  hasConnection: boolean;
  connections: { id: string; name: string }[];
  domains: { id: string; name: string; connectionId: string; projectId: string | null }[];
  projects: { id: string; name: string }[];
};
