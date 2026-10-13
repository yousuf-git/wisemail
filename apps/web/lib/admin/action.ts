import "server-only";

import type { z } from "zod";

import { adminActionHttp } from "@/lib/actions/action-core";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { guarded, parse } from "@/lib/actions/action";
import { getPlatformAdmin, type AdminActor } from "./guard";

/**
 * Server-action + HTTP wrapper for the admin panel: platform-admin check first (a non-admin gets
 * the same "not found" as a missing page), then Zod validation, then `run`.
 */
export function adminAction<S extends z.ZodType, R>(
  options: { id?: string; input: S },
  run: (args: { input: z.output<S>; admin: AdminActor }) => Promise<R>,
) {
  const http = adminActionHttp(options, run);
  return async (raw: z.input<S>, hdrs?: Headers): Promise<ActionResult<R>> => {
    if (hdrs) return http(raw, hdrs);
    return guarded(async () => {
      const admin = await getPlatformAdmin();
      if (!admin) return fail("not_found", "Not found.");
      const parsed = parse(options.input, raw);
      if (!parsed.ok) return parsed.result;
      return ok(await run({ input: parsed.data, admin }));
    });
  };
}
