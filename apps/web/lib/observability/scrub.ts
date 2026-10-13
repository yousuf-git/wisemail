/**
 * Re-export shared scrubbers. Kept here so existing `@/lib/observability/scrub` imports stay stable.
 * Implementation lives in `@wisemail/shared/sentry-scrub` (no `@sentry/nextjs` dependency).
 */
export {
  scrubBreadcrumb,
  scrubEvent,
  scrubString,
  scrubValue,
  type ScrubbableEvent,
} from "@wisemail/shared/sentry-scrub";
