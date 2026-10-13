import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request Headers for Better Auth API calls from services (no static `next/headers`).
 * Set by `orgActionHttp` / `orgRoute`. Tests and the seed script may use the fallback or the
 * lazy Next bridge below.
 */
const storage = new AsyncLocalStorage<Headers>();

/** Test / seed escape hatch when ALS is not entered. */
let fallback: Headers | null = null;

export function setRequestHeadersFallback(hdrs: Headers | null) {
  fallback = hdrs;
}

export function runWithRequestHeaders<T>(hdrs: Headers, fn: () => T): T {
  return storage.run(hdrs, fn);
}

export async function runWithRequestHeadersAsync<T>(
  hdrs: Headers,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(hdrs, fn);
}

/**
 * Headers for the active request. Prefers ALS, then the test fallback, then a lazy
 * `next/headers` read (Next RSC / legacy tests). Fastify always sets ALS.
 */
export async function getRequestHeaders(): Promise<Headers> {
  const fromStore = storage.getStore() ?? fallback;
  if (fromStore) return fromStore;
  const { headers } = await import("next/headers");
  return headers();
}
