import { listNotifications } from "@/lib/services/notifications";
import { z } from "zod";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const query = z.object({
  unread: z.enum(["0", "1"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z
    .string()
    .regex(/^[0-9a-f]{24}$/i)
    .optional(),
});

/** `GET /api/v1/notifications?orgSlug=&unread=1&limit=&cursor=` -> `NotificationsPage` (own feed). */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx, searchParams }) => {
    const q = query.parse(Object.fromEntries(searchParams));
    return listNotifications(ctx, {
      unreadOnly: q.unread === "1",
      limit: q.limit,
      cursor: q.cursor,
    });
  });
}
