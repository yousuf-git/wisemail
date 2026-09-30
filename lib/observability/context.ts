import * as Sentry from "@sentry/nextjs";

/** Tag the current request's Sentry scope with the org id (never its name or slug). No-op without a DSN. */
export function tagOrg(orgId: string): void {
  try {
    Sentry.getCurrentScope().setTag("orgId", orgId);
  } catch {
    // observability must never break a request
  }
}

/** Identify the actor by opaque id only. */
export function tagUser(userId: string): void {
  try {
    Sentry.getCurrentScope().setUser({ id: userId });
  } catch {}
}
