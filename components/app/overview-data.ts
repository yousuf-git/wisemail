import "server-only";

import type { OrgContext } from "@/lib/dal";
import type { InsightsDTO } from "@/lib/dto/insights";
import { getInsightFilterOptions, getInsights } from "@/lib/services/insights";
import { buildOverview, type Overview } from "./overview-model";

export type { Overview, OverviewKpi, OverviewKpiKey } from "./overview-model";

/** Server-side first paint of the overview: 7 day insights over `metric_rollups`. */
export async function getOverview(
  ctx: OrgContext,
): Promise<{ overview: Overview; insights: InsightsDTO | null; canSeeInsights: boolean }> {
  const canSeeInsights = ctx.can("insights:read");
  // Filter options and rollups are independent; skip rollups only when the member cannot see them.
  const [options, rawInsights] = await Promise.all([
    getInsightFilterOptions(ctx),
    canSeeInsights ? getInsights(ctx, { days: 7 }) : Promise.resolve(null),
  ]);
  const insights = options.hasConnection ? rawInsights : null;
  return {
    overview: buildOverview(insights, options.hasConnection, canSeeInsights),
    insights,
    canSeeInsights,
  };
}
