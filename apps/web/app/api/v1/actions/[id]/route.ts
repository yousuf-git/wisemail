import { dispatchOrgAction } from "@/lib/actions/dispatch";
import "@/lib/actions/register-all";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const { status, body: result } = await dispatchOrgAction(id, body, request.headers);
  return Response.json(result, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}
