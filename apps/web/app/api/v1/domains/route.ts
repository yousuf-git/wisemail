import { listDomains } from "@/lib/services/domains";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/domains?orgSlug=` → mirrored domains. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => listDomains(ctx));
}
