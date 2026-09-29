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
  const { hasConnection } = await getInsightFilterOptions(ctx);
  const insights = canSeeInsights && hasConnection ? await getInsights(ctx, { days: 7 }) : null;
  return {
    overview: buildOverview(insights, hasConnection, canSeeInsights),
    insights,
    canSeeInsights,
  };
}
