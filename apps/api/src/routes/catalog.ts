import type { FastifyPluginAsync } from "fastify";

import { getPlatformCatalog } from "@/lib/services/catalog";

/** Public (session not required) plan + platform catalog for pricing UI and clients. */
export const catalogRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/catalog", async (_request, reply) => {
    const catalog = await getPlatformCatalog();
    return reply
      .header("cache-control", "public, max-age=30")
      .send(catalog);
  });
};
