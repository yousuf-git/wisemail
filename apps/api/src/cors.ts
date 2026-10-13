import type { FastifyPluginAsync } from "fastify";

/**
 * Dev CORS for the Vite SPA when it talks to Fastify with an absolute
 * `VITE_API_URL` (cross-origin cookies). Same-origin proxy mode does not need this.
 */
const LOCAL_SPA = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

export const spaCors: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (!origin || !LOCAL_SPA.has(origin)) return;

    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] ?? "content-type, accept",
    );
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    reply.header("Vary", "Origin");

    if (req.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });
};
