import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "./lib/observability/options";

export async function validateEnvOrExit() {
  try {
    await import("./lib/env");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error("[env] Shutting down.");
    process.exit(1);
  }
}

/** Node runtime only (no Edge, TRD §1). Disabled unless SENTRY_DSN is set. */
export async function initSentry() {
  const { env } = await import("./lib/env");
  if (!env.SENTRY_DSN) return;
  Sentry.init(
    sentryOptions({
      dsn: env.SENTRY_DSN,
      release: env.SENTRY_RELEASE,
      environment: env.NODE_ENV,
    }),
  );
}
