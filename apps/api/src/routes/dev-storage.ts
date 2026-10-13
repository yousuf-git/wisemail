import type { FastifyPluginAsync } from "fastify";

import { GET as getDevStorage, PUT as putDevStorage } from "@/app/api/dev-storage/[token]/route";

import { sendWebResponse, toWebRequest } from "../http.js";

/**
 * Fake-storage "presigned" URLs for SPA/API local uploads (`STORAGE_MODE=fake`).
 * Bridges the Next route handlers; 404s when not in fake mode.
 */
export const devStorageRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    "*",
    { parseAs: "buffer", bodyLimit: 45 * 1024 * 1024 },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.get<{ Params: { token: string } }>("/api/dev-storage/:token", async (req, reply) => {
    const response = await getDevStorage(toWebRequest(req), {
      params: Promise.resolve(req.params),
    });
    return sendWebResponse(reply, response);
  });

  app.put<{ Params: { token: string } }>(
    "/api/dev-storage/:token",
    { bodyLimit: 45 * 1024 * 1024 },
    async (req, reply) => {
      const body = req.body;
      const raw = Buffer.isBuffer(body)
        ? body
        : body instanceof ArrayBuffer
          ? Buffer.from(new Uint8Array(body))
          : body instanceof Uint8Array
            ? Buffer.from(body)
            : Buffer.alloc(0);
      const response = await putDevStorage(toWebRequest(req, raw), {
        params: Promise.resolve(req.params),
      });
      return sendWebResponse(reply, response);
    },
  );
};
