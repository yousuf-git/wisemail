import { listAuditLog } from "@/lib/services/audit-log-read";
import { auditQuery } from "@/lib/validation/audit";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/audit?orgSlug=&cursor=&limit=&actor=&action=&targetType=&from=&to=` -> `AuditPageDTO`. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx, searchParams }) =>
    listAuditLog(ctx, auditQuery.parse(Object.fromEntries(searchParams))),
  );
}
