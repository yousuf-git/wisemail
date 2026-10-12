import { getAiStatus } from "@/lib/services/ai-settings";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/ai/status?orgSlug=` -> `AiStatusDTO` (plan gate, opt-out, credits). */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => getAiStatus(ctx));
}
