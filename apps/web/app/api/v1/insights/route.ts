import { authorize } from "@/lib/dal";
import { getInsights } from "@/lib/services/insights";
import { insightsQuery } from "../_lib/insights-query";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/insights?orgSlug=&days=7|30|90&connectionId=&domainId=&projectId=&stream=` -> `InsightsDTO`. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx, searchParams }) => {
    authorize(ctx, "insights:read");
    const { days, ...filters } = insightsQuery.parse(
      Object.fromEntries([...searchParams].filter(([k]) => k !== "orgSlug")),
    ) as { days: 7 | 30 | 90 } & import("@/lib/dto/insights").InsightFilters;
    return getInsights(ctx, { days, filters });
  });
}
