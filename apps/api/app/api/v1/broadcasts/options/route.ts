import { getBroadcastFormOptions } from "@/lib/services/broadcasts";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/broadcasts/options?orgSlug=` → editor choice lists. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => getBroadcastFormOptions(ctx));
}
