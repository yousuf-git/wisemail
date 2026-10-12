import "server-only";

import type { ActionResult } from "@/lib/actions/result";

type OrgHttpAction<I, R> = (
  orgSlug: string,
  raw: I,
  headers: Headers,
) => Promise<ActionResult<R>>;

/**
 * Next.js `"use server"` bridge: loads `next/headers` only when a server action runs.
 * Not imported by the Fastify action registry path.
 */
export function asServerAction<I, R>(fn: OrgHttpAction<I, R>) {
  return async (orgSlug: string, raw: I): Promise<ActionResult<R>> => {
    const { headers } = await import("next/headers");
    return fn(orgSlug, raw, await headers());
  };
}
