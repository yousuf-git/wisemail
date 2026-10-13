/**
 * Client Sentry hook. Reporting activates once `@sentry/browser` is a direct SPA
 * dependency (M8a install). Until then a DSN alone is ignored so Vite builds stay clean.
 */
export async function initSpaSentry(): Promise<void> {
  const dsn =
    (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim() ||
    (import.meta.env.SENTRY_DSN as string | undefined)?.trim();
  if (!dsn) return;

  try {
    // Fully dynamic so Rollup does not resolve the optional package at build time.
    const spec = "@sentry/" + "browser";
    const Sentry = (await import(/* @vite-ignore */ spec)) as {
      init: (options: Record<string, unknown>) => void;
    };
    const { scrubBreadcrumb, scrubEvent } = await import("@wisemail/shared/sentry-scrub");
    Sentry.init({
      dsn,
      enabled: true,
      release: (import.meta.env.VITE_SENTRY_RELEASE as string | undefined) || undefined,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.05,
      maxBreadcrumbs: 50,
      sendDefaultPii: false,
      beforeSend: (event: unknown, hint: unknown) => scrubEvent(event as never, hint),
      beforeBreadcrumb: scrubBreadcrumb,
    });
  } catch {
    if (import.meta.env.DEV) {
      console.warn(
        "[spa] Sentry DSN set but @sentry/browser is not installed; client errors stay local.",
      );
    }
  }
}
