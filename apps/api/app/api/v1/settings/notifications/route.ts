import { getNotificationPreferences } from "@/lib/services/notifications";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/settings/notifications?orgSlug=` → notification preferences. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => getNotificationPreferences(ctx));
}
