import cookie from "@fastify/cookie";
import Fastify from "fastify";

import { PLAN_ORDER } from "@wisemail/shared";

import { healthRoutes } from "./routes/health.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cookie);

  await app.register(healthRoutes);

  // Smoke check that the shared workspace package resolves.
  app.get("/api/v1/_meta", async () => ({
    name: "wisemail-api",
    plans: PLAN_ORDER,
  }));

  return app;
}
