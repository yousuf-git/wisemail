import cookie from "@fastify/cookie";
import Fastify from "fastify";

import { DEFAULT_PLAN_CATALOG, PLAN_ORDER } from "@wisemail/shared";

import { spaCors } from "./cors.js";
import { healthRoutes } from "./routes/health.js";

export type BuildAppOptions = {
  /** Skip DB-backed routes (unit smoke tests without Mongo / full env). */
  lite?: boolean;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: !options.lite,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cookie);
  await app.register(spaCors);
  await app.register(healthRoutes);

  app.get("/api/v1/_meta", async () => ({
    name: "wisemail-api",
    plans: PLAN_ORDER,
    catalogVersion: "db",
    planCount: Object.keys(DEFAULT_PLAN_CATALOG).length,
    lite: Boolean(options.lite),
    routes: options.lite
      ? ["/health", "/api/v1/_meta"]
      : [
          "/health",
          "/api/auth/*",
          "/api/ingest/resend/:connectionId",
          "/api/billing/stripe-webhook",
          "/api/stream",
          "/api/files/:attachmentId",
          "/api/dev-storage/:token",
          "/api/inngest",
          "/api/v1/catalog",
          "/api/v1/actions/:id",
          "/api/v1/admin/*",
          "/api/v1/admin-actions/:id",
          "/api/v1/*",
        ],
  }));

  if (options.lite) return app;

  const { connectDb } = await import("@/lib/db/connect");
  const { getPlatformCatalog } = await import("@/lib/services/catalog");
  const { authRoutes } = await import("./routes/auth.js");
  const { ingestRoutes } = await import("./routes/ingest.js");
  const { stripeWebhookRoutes } = await import("./routes/stripe-webhook.js");
  const { streamRoutes } = await import("./routes/stream.js");
  const { fileRoutes } = await import("./routes/files.js");
  const { devStorageRoutes } = await import("./routes/dev-storage.js");
  const { inngestRoutes } = await import("./routes/inngest.js");
  const { actionRoutes } = await import("./routes/actions.js");
  const { catalogRoutes } = await import("./routes/catalog.js");
  const { adminRoutes } = await import("./routes/admin.js");
  const { inviteRoutes } = await import("./routes/invite.js");
  const { v1Routes } = await import("./routes/v1.js");

  app.addHook("onReady", async () => {
    await connectDb();
    await getPlatformCatalog();
  });

  await app.register(authRoutes);
  await app.register(ingestRoutes);
  await app.register(stripeWebhookRoutes);
  await app.register(streamRoutes);
  await app.register(fileRoutes);
  await app.register(devStorageRoutes);
  await app.register(inngestRoutes);
  await app.register(catalogRoutes);
  await app.register(actionRoutes);
  await app.register(adminRoutes);
  await app.register(inviteRoutes);
  await app.register(v1Routes);

  return app;
}
