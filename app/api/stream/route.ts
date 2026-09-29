import { getOrgContext } from "@/lib/dal";
import { openEventStream } from "@/lib/realtime/stream";
import { loadProjectScope, roleIsScopable } from "@/lib/services/project-scope";
import { resolveOrgAccess } from "@/lib/services/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Seconds. The stream closes itself a little earlier and the client reconnects with `Last-Event-ID`. */
export const maxDuration = 300;

const problem = (status: number, error: string, message: string) =>
  Response.json({ error, message }, { status, headers: { "cache-control": "private, no-store" } });

/**
 * `GET /api/stream?orgSlug=` -> `text/event-stream` (TRD §2.6). Session + membership are checked
 * through the DAL (401 no session, 404 non-member or unknown slug); the org id never comes from
 * the request. `Last-Event-ID` (or `?lastEventId=`, for clients that recreate the EventSource)
 * replays missed events first.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgSlug = url.searchParams.get("orgSlug");
  if (!orgSlug) return problem(400, "validation", "orgSlug is required.");

  const result = await getOrgContext(orgSlug);
  if (result.status === "unauthenticated") {
    return problem(401, "unauthenticated", "Please sign in again.");
  }
  if (result.status === "not_member") {
    return problem(404, "not_found", "We couldn't find that workspace.");
  }
  const { ctx } = result;

  const body = await openEventStream({
    orgId: ctx.org.id,
    userId: ctx.user.id,
    projectScope: ctx.projectScope,
    lastEventId: request.headers.get("last-event-id") ?? url.searchParams.get("lastEventId"),
    signal: request.signal,
    reauthorize: async () => {
      const access = await resolveOrgAccess(ctx.user.id, orgSlug);
      if (!access || access.org.id !== ctx.org.id) return null;
      const projectScope = roleIsScopable(access.role)
        ? await loadProjectScope({
            orgId: access.org.id,
            memberId: access.memberId,
            role: access.role,
          })
        : null;
      return { projectScope };
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "private, no-store, no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
