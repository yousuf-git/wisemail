import { getAuditFilters } from "@/lib/services/audit-log-read";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/audit/filters?orgSlug=` → `AuditFiltersDTO`. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => getAuditFilters(ctx));
}
