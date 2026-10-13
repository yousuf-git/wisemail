import { createRequire } from "node:module";

import { scrubBreadcrumb, scrubEvent } from "@wisemail/shared/sentry-scrub";

/**
 * Optional Sentry for Fastify. Loads `@sentry/node` only when `SENTRY_DSN` is set and the
 * package is installed (M8a). Until then this is a no-op — no new dependency required to boot.
 */
export async function initApiSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  const require = createRequire(import.meta.url);
  let Sentry: {
    init: (opts: Record<string, unknown>) => void;
    setupFastifyErrorHandler?: (app: unknown) => void;
  };
  try {
    Sentry = require("@sentry/node");
  } catch {
    console.warn(
      "[api] SENTRY_DSN is set but @sentry/node is not installed; error reporting stays local.",
    );
    return;
  }

  Sentry.init({
    dsn,
    enabled: true,
    release: process.env.SENTRY_RELEASE || undefined,
    environment: process.env.NODE_ENV || undefined,
    tracesSampleRate: 0.05,
    maxBreadcrumbs: 50,
    sendDefaultPii: false,
    beforeSend: (event: Parameters<typeof scrubEvent>[0], hint: unknown) =>
      scrubEvent(event, hint),
    beforeBreadcrumb: (crumb: Parameters<typeof scrubBreadcrumb>[0]) => scrubBreadcrumb(crumb),
  });
}

/** Attach Fastify error handler when the SDK exposes one (Sentry v8+). */
export function attachApiSentry(app: { setErrorHandler?: unknown } & object): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  const require = createRequire(import.meta.url);
  try {
    const Sentry = require("@sentry/node") as {
      setupFastifyErrorHandler?: (app: unknown) => void;
      captureException?: (err: unknown) => void;
    };
    if (typeof Sentry.setupFastifyErrorHandler === "function") {
      Sentry.setupFastifyErrorHandler(app);
    }
  } catch {
    /* optional */
  }
}
