import { env } from "@/lib/env";
import { getStore } from "@/lib/storage";
import { responseDisposition, verifyFakeToken } from "@/lib/storage/fake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves the fake object store's "presigned" URLs (STORAGE_MODE=fake). Development and tests
 * only: it 404s in production and whenever R2 is the active store. Authority comes solely from
 * the HMAC token (operation, key, expiry, and for uploads the signed size and type).
 */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const gone = () => new Response("Not found", { status: 404 });

function guard(token: string) {
  if (env.NODE_ENV === "production" || env.STORAGE_MODE !== "fake") return null;
  return verifyFakeToken(token);
}

export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const payload = guard((await ctx.params).token);
  if (!payload || payload.m !== "get") return gone();
  const object = await getStore().get(payload.k);
  if (!object) return gone();
  return new Response(new Uint8Array(object.body), {
    headers: {
      "content-type": payload.contentType ?? object.contentType ?? "application/octet-stream",
      "content-disposition": responseDisposition(payload),
      "content-length": String(object.body.length),
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "cache-control": "private, no-store",
    },
  });
}

export async function PUT(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const payload = guard((await ctx.params).token);
  if (!payload || payload.m !== "put") return gone();
  const size = payload.size ?? 0;
  if (size <= 0 || size > MAX_UPLOAD_BYTES) return new Response("Bad size", { status: 400 });
  if ((request.headers.get("content-type") ?? "") !== payload.contentType) {
    return new Response("Content-Type does not match the signed type", { status: 403 });
  }
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length !== size) {
    return new Response("Content-Length does not match the signed size", { status: 403 });
  }
  await getStore().put(payload.k, body, { contentType: payload.contentType });
  return new Response(null, { status: 200 });
}
