import { listConnections } from "@/lib/services/connections";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/connections?orgSlug=` → connection list. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => listConnections(ctx));
}
