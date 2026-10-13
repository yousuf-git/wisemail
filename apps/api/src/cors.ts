import type { FastifyPluginAsync } from "fastify";

/**
 * CORS for the Vite/Vercel SPA when it calls Fastify with credentials
 * (`VITE_API_URL` absolute). Same-origin (Vite proxy / Nginx on one host) skips this.
 *
 * Allowed origins: APP_URL, SPA_ORIGINS (comma list), plus local Vite ports.
 */
function allowedOrigins(): Set<string> {
  const set = new Set<string>(["http://localhost:5173", "http://127.0.0.1:5173"]);
  for (const key of ["APP_URL", "SPA_ORIGINS"] as const) {
    const raw = process.env[key];
    if (!raw) continue;
    for (const part of raw.split(",")) {
      const origin = part.trim().replace(/\/$/, "");
      if (origin) set.add(origin);
    }
  }
  return set;
}

export const spaCors: FastifyPluginAsync = async (app) => {
  const origins = allowedOrigins();

  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (!origin || !origins.has(origin)) return;

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
