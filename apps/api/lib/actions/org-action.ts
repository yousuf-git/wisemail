import "server-only";

import { z } from "zod";

import { orgActionHttp } from "@/lib/actions/action-core";
import type { ActionResult } from "@/lib/actions/result";
import type { OrgContext } from "@/lib/dal-types";
import type { Permission } from "@/lib/auth/permissions";

type Options<S extends z.ZodType> = {
  id?: string;
  input: S;
  permission?: Permission;
};

/**
 * Registers an org mutation for HTTP. No static Next.js imports.
 *
 * Call with `(orgSlug, raw, headers)` from Fastify / `dispatchOrgAction`.
 * Call with `(orgSlug, raw)` from Next server actions / tests — headers are loaded
 * lazily via `next/headers` only on that path.
 */
export function orgAction<S extends z.ZodType, R>(
  options: Options<S>,
  run: (args: { input: z.output<S>; ctx: OrgContext }) => Promise<R>,
) {
  const http = orgActionHttp(options, run);
  return async (
    orgSlug: string,
    raw: z.input<S>,
    hdrs?: Headers,
  ): Promise<ActionResult<R>> => {
    if (hdrs) return http(orgSlug, raw, hdrs);
    const { headers } = await import("next/headers");
    return http(orgSlug, raw, await headers());
  };
}
