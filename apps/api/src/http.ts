import type { FastifyReply, FastifyRequest } from "fastify";

/** Build a Fetch `Request` from a Fastify request (for handlers written against Web Request). */
export function toWebRequest(req: FastifyRequest, rawBody?: Buffer | string): Request {
  const host = req.headers.host ?? "localhost";
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  const url = `${proto}://${host}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  const method = req.method.toUpperCase();
  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    if (rawBody !== undefined) {
      init.body = typeof rawBody === "string" ? rawBody : new Uint8Array(rawBody);
    } else if (req.body !== undefined && req.body !== null) {
      init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    }
  }
  return new Request(url, init);
}

/** Pipe a Fetch `Response` into a Fastify reply (including SSE streams). */
export async function sendWebResponse(reply: FastifyReply, response: Response) {
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    // Node / Fastify manage transfer-encoding and content-length for streams.
    if (key === "transfer-encoding" || key === "content-length") return;
    reply.header(key, value);
  });
  if (!response.body) {
    return reply.send();
  }
  const buf = Buffer.from(await response.arrayBuffer());
  return reply.send(buf);
}

/** Like sendWebResponse but streams the body (SSE / large downloads). */
export async function pipeWebResponse(reply: FastifyReply, response: Response) {
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    if (key === "transfer-encoding") return;
    reply.header(key, value);
  });
  if (!response.body) return reply.send();

  reply.hijack();
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) reply.raw.write(value);
    }
    reply.raw.end();
  } catch (error) {
    reply.raw.destroy(error instanceof Error ? error : undefined);
  }
}
