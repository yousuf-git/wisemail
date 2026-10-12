import { dispatchOrgAction } from "@/lib/actions/dispatch";
import "@/lib/actions/register-all";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/actions/:id` `{ orgSlug, input }` -> `ActionResult`.
 * Same registry as Fastify; cookies authenticate the member.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: { code: "validation", message: "The request body isn't valid JSON." } },
      { status: 400, headers: { "cache-control": "private, no-store" } },
    );
  }
  const { status, body } = await dispatchOrgAction(id, rawBody, request.headers);
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}
