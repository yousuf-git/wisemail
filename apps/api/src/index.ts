import { loadRootEnv } from "./load-root-env.js";

loadRootEnv();

const { loadApiEnv } = await import("./env.js");
const { buildApp } = await import("./app.js");

const env = loadApiEnv();
const app = await buildApp();

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`Wisemail API listening on http://${env.HOST}:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
