import { getProjectQuota, listProjects } from "@/lib/services/projects";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/projects?orgSlug=` → projects + quota + capability flags. */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx }) => {
    const can = {
      read: ctx.can("project:read"),
      create: ctx.can("project:create"),
      update: ctx.can("project:update"),
      delete: ctx.can("project:delete"),
    };
    if (!can.read) {
      return {
        projects: [],
        quota: { used: 0, limit: null, planLabel: "", nextTierLabel: null },
        can,
      };
    }
    const [projects, quota] = await Promise.all([listProjects(ctx), getProjectQuota(ctx)]);
    return { projects, quota, can };
  });
}
