import { exportAuditCsv } from "@/lib/services/audit-log-read";
import { auditQuery } from "@/lib/validation/audit";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/audit/export?orgSlug=&actor=&action=&targetType=&from=&to=` -> CSV download (max 10,000 rows). */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx, searchParams }) => {
    const {
      cursor: _cursor,
      limit: _limit,
      ...filters
    } = auditQuery.parse(Object.fromEntries(searchParams));
    void _cursor;
    void _limit;
    const csv = await exportAuditCsv(ctx, filters);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="wisemail-audit-${ctx.org.slug}-${stamp}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  });
}
