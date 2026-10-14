import { getConnectionQuota, listConnections } from "@/lib/services/connections";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/connections?orgSlug=` → connections page payload (list + quota + permissions).
 * SPA-only shape (array response replaced during react-migration).
 */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx }) => {
    const [connections, quota] = await Promise.all([
      listConnections(ctx),
      getConnectionQuota(ctx),
    ]);
    return {
      connections,
      quota,
      can: {
        create: ctx.can("connection:create"),
        update: ctx.can("connection:update"),
        delete: ctx.can("connection:delete"),
        domainUpdate: ctx.can("domain:update"),
      },
    };
  });
}
