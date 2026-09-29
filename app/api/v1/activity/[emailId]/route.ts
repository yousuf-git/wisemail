import { getEmailTimeline } from "@/lib/services/emails";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/activity/[emailId]?orgSlug=` -> `EmailTimelineDTO` (404 outside the caller's org). */
export async function GET(request: Request, route: { params: Promise<{ emailId: string }> }) {
  const { emailId } = await route.params;
  return orgRoute(request, ({ ctx }) => getEmailTimeline(ctx, emailId));
}
