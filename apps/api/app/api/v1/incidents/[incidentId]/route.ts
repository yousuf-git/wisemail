import { getIncident } from "@/lib/services/alerts";
import { ServiceError } from "@/lib/services/errors";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/incidents/[incidentId]?orgSlug=` → incident + capability flags. */
export async function GET(request: Request, route: { params: Promise<{ incidentId: string }> }) {
  const { incidentId } = await route.params;
  return orgRoute(request, async ({ ctx }) => {
    const incident = await getIncident(ctx, incidentId);
    if (!incident) throw new ServiceError("not_found", "Incident not found.");
    return {
      incident,
      can: { acknowledge: ctx.can("alertRule:update") },
    };
  });
}
