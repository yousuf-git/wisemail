import {
  getDomain,
  listProjectChoices,
} from "@/lib/services/domains";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/domains/[domainId]?orgSlug=` → domain detail + editor choices. */
export async function GET(request: Request, route: { params: Promise<{ domainId: string }> }) {
  const { domainId } = await route.params;
  return orgRoute(request, async ({ ctx }) => {
    const [domain, projects] = await Promise.all([
      getDomain(ctx, domainId),
      listProjectChoices(ctx),
    ]);
    return {
      domain,
      projects,
      can: {
        update: ctx.can("domain:update"),
        verify: ctx.can("domain:verify"),
        delete: ctx.can("domain:delete"),
        assignProject: ctx.can("project:update"),
      },
    };
  });
}
