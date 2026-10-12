import { getUnreadCount } from "@/lib/services/notifications";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/notifications/unread?orgSlug=` -> `{ unreadCount }` for the top-bar bell. */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx }) => ({ unreadCount: await getUnreadCount(ctx) }));
}
