import type { InsightFilters, InsightRange, InsightsDTO } from "@/lib/dto/insights";

export const insightsKey = (orgSlug: string, days: InsightRange, filters: InsightFilters) =>
  ["insights", orgSlug, days, filters] as const;

export async function fetchInsights(
  orgSlug: string,
  days: InsightRange,
  filters: InsightFilters,
): Promise<InsightsDTO> {
  const search = new URLSearchParams({ orgSlug, days: String(days) });
  for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value);
  const response = await fetch(`/api/v1/insights?${search}`, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Insights request failed (${response.status})`);
  return (await response.json()) as InsightsDTO;
}
