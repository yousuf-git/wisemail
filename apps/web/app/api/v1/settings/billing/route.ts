import { getBillingOverview } from "@/lib/services/plan-changes";
import { orgRoute, errorResponse } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/settings/billing?orgSlug=` → billing overview (Owners/Admins with billing:read). */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx }) => {
    if (!ctx.can("billing:read")) {
      return errorResponse(403, "forbidden", "You don't have permission to view billing.");
    }
    return getBillingOverview(ctx);
  });
}
