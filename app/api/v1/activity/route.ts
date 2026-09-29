import { listActivity } from "@/lib/services/emails";
import { orgRoute } from "../_lib/org-api";
import { activityQuery, toActivityInput } from "../_lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/activity?orgSlug=&cursor=&limit=&status=&direction=&...` -> `Page<ActivityRowDTO>`. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx, searchParams }) =>
    listActivity(ctx, toActivityInput(activityQuery.parse(Object.fromEntries(searchParams)))),
  );
}
