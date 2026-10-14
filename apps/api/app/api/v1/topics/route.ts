import { listTopics } from "@/lib/services/topics";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/topics?orgSlug=&connectionId=` → `TopicDTO[]`. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx, searchParams }) => {
    const connectionId = searchParams.get("connectionId") || undefined;
    return listTopics(ctx, { connectionId });
  });
}
