import { authorize } from "@/lib/dal-types";
import { getInsightFilterOptions } from "@/lib/services/insights";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/insights/options?orgSlug=` → `InsightFilterOptions`. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => {
    authorize(ctx, "insights:read");
    return getInsightFilterOptions(ctx);
  });
}
