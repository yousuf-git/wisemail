import { listBroadcasts } from "@/lib/services/broadcasts";
import { listConnectionOptions } from "@/lib/services/audience-shared";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/broadcasts?orgSlug=` → list payload for the SPA. */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx }) => {
    const [broadcasts, connections] = await Promise.all([
      listBroadcasts(ctx),
      listConnectionOptions(ctx),
    ]);
    return {
      broadcasts,
      connections,
      can: {
        create: ctx.can("broadcast:create"),
        send: ctx.can("broadcast:send"),
      },
    };
  });
}
