import { getBroadcast } from "@/lib/services/broadcasts";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/broadcasts/[broadcastId]?orgSlug=` → `BroadcastDTO`. */
export async function GET(request: Request, route: { params: Promise<{ broadcastId: string }> }) {
  const { broadcastId } = await route.params;
  return orgRoute(request, ({ ctx }) => getBroadcast(ctx, broadcastId));
}
