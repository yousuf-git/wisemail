import { listConnectionOptions } from "@/lib/services/audience-shared";
import { listTemplates } from "@/lib/services/templates";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/templates?orgSlug=` → list payload for the SPA. */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx }) => {
    const [templates, connections] = await Promise.all([
      listTemplates(ctx),
      listConnectionOptions(ctx),
    ]);
    return {
      templates,
      connections,
      can: {
        create: ctx.can("template:create"),
        update: ctx.can("template:update"),
        delete: ctx.can("template:delete"),
      },
    };
  });
}
