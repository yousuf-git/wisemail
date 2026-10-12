import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/observability/options";

// Client init. `NEXT_PUBLIC_SENTRY_DSN` is inlined at build time from SENTRY_DSN (next.config.ts);
// without a DSN Sentry stays disabled and nothing is sent.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  // No session replay integration on purpose: it would record mail content.
  Sentry.init(
    sentryOptions({
      dsn,
      release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
      environment: process.env.NODE_ENV,
    }),
  );
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
