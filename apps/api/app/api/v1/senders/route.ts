import { listSenders } from "@/lib/services/senders";
import { orgRoute, errorResponse } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/senders?orgSlug=` → senders the member can see. */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx }) => {
    if (!ctx.can("sender:read")) {
      return errorResponse(403, "forbidden", "You don't have permission to view senders.");
    }
    return listSenders(ctx);
  });
}
