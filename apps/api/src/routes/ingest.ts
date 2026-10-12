import type { FastifyPluginAsync } from "fastify";

import { ingestResendWebhook, MAX_INGEST_BYTES } from "@/lib/services/ingest";

export const ingestRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string", bodyLimit: MAX_INGEST_BYTES },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.post<{ Params: { connectionId: string } }>(
    "/api/ingest/resend/:connectionId",
    async (request, reply) => {
      const rawBody = typeof request.body === "string" ? request.body : "";
      if (Buffer.byteLength(rawBody, "utf8") > MAX_INGEST_BYTES) {
        return reply.code(413).send({ error: "too_large" });
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) for (const v of value) headers.append(key, v);
        else headers.set(key, value);
      }
      const outcome = await ingestResendWebhook({
        connectionId: request.params.connectionId,
        rawBody,
        headers,
      });
      return reply.code(outcome.status).send(outcome.body);
    },
  );
};
