import { loadRootEnv } from "./load-root-env.js";

loadRootEnv();

const { loadApiEnv } = await import("./env.js");
const { initApiSentry, attachApiSentry } = await import("./sentry.js");
const { buildApp } = await import("./app.js");

await initApiSentry();

const env = loadApiEnv();
const app = await buildApp();
attachApiSentry(app);

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`Wisemail API listening on http://${env.HOST}:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
