import { getAiUsage } from "@/lib/services/ai-settings";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/ai/usage?orgSlug=&limit=` → `AiUsageSummary` (ai:configure). */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx, searchParams }) => {
    const raw = searchParams.get("limit");
    const limit = raw ? Number(raw) : undefined;
    return getAiUsage(ctx, {
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  });
}
