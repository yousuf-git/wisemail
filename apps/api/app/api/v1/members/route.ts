import { listInvitations, listMembers } from "@/lib/services/members";
import { orgRoute, errorResponse } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/members?orgSlug=` → members + pending invitations (managers only). */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx }) => {
    if (!ctx.can("member:update")) {
      return errorResponse(403, "forbidden", "You don't have permission to manage members.");
    }
    const [members, invitations] = await Promise.all([
      listMembers(ctx),
      listInvitations(ctx),
    ]);
    return { members, invitations };
  });
}
