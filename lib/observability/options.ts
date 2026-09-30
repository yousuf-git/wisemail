import type { NodeOptions } from "@sentry/nextjs";

import { scrubBreadcrumb, scrubEvent } from "./scrub";

/**
 * Shared Sentry options for server and client. `sendDefaultPii: false` plus `scrubEvent` keeps
 * email content, headers, cookies and keys out of reports. Tracing is sampled low: errors are the
 * point, performance lives in Vercel Observability.
 */
export function sentryOptions(input: {
  dsn: string | undefined;
  release?: string;
  environment?: string;
}): NodeOptions {
  return {
    dsn: input.dsn || undefined,
    enabled: !!input.dsn,
    release: input.release || undefined,
    environment: input.environment || undefined,
    // Collect nothing optional (SDK v11 `dataCollection`); `scrubEvent` is the second layer.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
    },
    tracesSampleRate: 0.05,
    maxBreadcrumbs: 50,
    beforeSend: (event, hint) => scrubEvent(event, hint),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  };
}
