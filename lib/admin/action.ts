import "server-only";

import type { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { guarded, parse } from "@/lib/actions/action";
import { getPlatformAdmin, type AdminActor } from "./guard";

/**
 * Server-action wrapper for the admin panel: platform-admin check first (a non-admin gets the
 * same "not found" as a missing page), then Zod validation, then `run`. Typed errors as in
 * `orgAction`.
 */
export function adminAction<S extends z.ZodType, R>(
  options: { input: S },
  run: (args: { input: z.output<S>; admin: AdminActor }) => Promise<R>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> =>
    guarded(async () => {
      const admin = await getPlatformAdmin();
      if (!admin) return fail("not_found", "Not found.");
      const parsed = parse(options.input, raw);
      if (!parsed.ok) return parsed.result;
      return ok(await run({ input: parsed.data, admin }));
    });
}
