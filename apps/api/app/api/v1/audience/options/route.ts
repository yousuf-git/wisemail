import { listAudienceOptions } from "@/lib/services/contacts";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/audience/options?orgSlug=` → filter/editor option lists. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => listAudienceOptions(ctx));
}
