import type { NextRequest } from "next/server";

import { ingestResendWebhook, MAX_INGEST_BYTES } from "@/lib/services/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reads at most `max` bytes; returns null when the body is larger. */
async function readCapped(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/ingest/resend/[connectionId]">,
) {
  const { connectionId } = await ctx.params;
  const rawBody = await readCapped(request, MAX_INGEST_BYTES);
  if (rawBody === null) return Response.json({ error: "too_large" }, { status: 413 });

  const outcome = await ingestResendWebhook({
    connectionId,
    rawBody,
    headers: request.headers,
  });
  return Response.json(outcome.body, { status: outcome.status });
}
