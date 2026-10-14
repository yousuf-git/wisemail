import { listCleanupRules } from "@/lib/deletion/rules";
import { orgRoute, errorResponse } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/settings/cleanup?orgSlug=` → cleanup rules (cleanupRule:manage). */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx }) => {
    if (!ctx.can("cleanupRule:manage")) {
      return errorResponse(403, "forbidden", "You don't have permission to manage cleanup rules.");
    }
    const rules = await listCleanupRules(ctx);
    return {
      rules,
      canDelete: ctx.can("cleanupRule:manageDelete"),
    };
  });
}
