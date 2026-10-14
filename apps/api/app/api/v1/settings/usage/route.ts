import { getUsageOverview } from "@/lib/services/usage";
import { orgRoute, errorResponse } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/settings/usage?orgSlug=` → usage overview (usage:read). */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx }) => {
    if (!ctx.can("usage:read")) {
      return errorResponse(403, "forbidden", "You don't have permission to view usage.");
    }
    return getUsageOverview(ctx);
  });
}
