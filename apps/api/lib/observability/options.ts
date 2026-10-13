import type { NodeOptions } from "@sentry/node";

import { scrubBreadcrumb, scrubEvent } from "./scrub";

/**
 * Shared Sentry options for the API. `sendDefaultPii: false` plus `scrubEvent` keeps
 * email content, headers, cookies and keys out of reports.
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
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
    maxBreadcrumbs: 50,
    beforeSend: (event, hint) => scrubEvent(event as never, hint) as typeof event | null,
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb as never) as typeof crumb | null,
  };
}
