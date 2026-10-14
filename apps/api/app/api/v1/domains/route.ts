import {
  listDomains,
  listManageableConnections,
  listProjectChoices,
} from "@/lib/services/domains";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/domains?orgSlug=` → list payload for the SPA. */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx }) => {
    const [domains, projects, connections] = await Promise.all([
      listDomains(ctx),
      listProjectChoices(ctx),
      ctx.can("domain:create") && ctx.can("connection:read")
        ? listManageableConnections(ctx)
        : Promise.resolve([]),
    ]);
    return {
      domains,
      projects,
      connections,
      projectRequired: ctx.projectScope !== null,
      can: {
        create: ctx.can("domain:create"),
        update: ctx.can("domain:update"),
        assignProject: ctx.can("project:update"),
      },
    };
  });
}
