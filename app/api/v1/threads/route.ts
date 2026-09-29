import { listThreads } from "@/lib/services/emails";
import { orgRoute } from "../_lib/org-api";
import { threadsQuery } from "../_lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/threads?orgSlug=&folder=&cursor=&limit=&q=&unread=` -> `Page<MailListRowDTO>`. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx, searchParams }) => {
    const query = threadsQuery.parse(Object.fromEntries(searchParams));
    return listThreads(ctx, query);
  });
}
