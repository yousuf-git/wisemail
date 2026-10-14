import { getOverview } from "@/lib/services/overview-data";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/overview?orgSlug=` → overview KPIs + summary for the org home. */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx }) => {
    const { overview } = await getOverview(ctx);
    return overview;
  });
}
