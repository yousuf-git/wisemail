import { getUsageSummary } from "@/lib/services/usage";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/usage/summary?orgSlug=` → dock usage tile data (any member). */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => getUsageSummary(ctx));
}
