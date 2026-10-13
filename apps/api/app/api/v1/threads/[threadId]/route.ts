import { getThread } from "@/lib/services/emails";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/threads/[threadId]?orgSlug=` -> `ThreadDetailDTO` (404 outside the caller's org). */
export async function GET(request: Request, route: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await route.params;
  return orgRoute(request, ({ ctx }) => getThread(ctx, threadId));
}
