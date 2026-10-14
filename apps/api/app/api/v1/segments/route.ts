import { listSegments } from "@/lib/services/segments";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/segments?orgSlug=&connectionId=` → `SegmentDTO[]`. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx, searchParams }) => {
    const connectionId = searchParams.get("connectionId") || undefined;
    return listSegments(ctx, { connectionId });
  });
}
