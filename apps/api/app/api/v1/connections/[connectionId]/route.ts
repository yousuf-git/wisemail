import { getConnectionDetail } from "@/lib/services/connection-detail";
import { ServiceError } from "@/lib/services/errors";
import { orgRoute, errorResponse } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/connections/:connectionId?orgSlug=` → connection detail. */
export function GET(
  request: Request,
  context?: { params: Promise<{ connectionId: string }> },
) {
  return orgRoute(request, async ({ ctx }) => {
    const { connectionId } = (await context?.params) ?? { connectionId: "" };
    try {
      const connection = await getConnectionDetail(ctx, connectionId);
      return {
        connection,
        can: {
          update: ctx.can("connection:update"),
          domainUpdate: ctx.can("domain:update"),
        },
      };
    } catch (error) {
      if (error instanceof ServiceError && error.code === "not_found") {
        return errorResponse(404, "not_found", "We couldn't find that connection.");
      }
      throw error;
    }
  });
}
