import "server-only";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { getSession, type UserDTO } from "@/lib/dal";
import type { Permission } from "@/lib/auth/permissions";
import { ActionFailure, guardedHttp, parse } from "@/lib/actions/action-core";
import { fail, ok, type ActionResult } from "./result";

export { ActionFailure, parse } from "@/lib/actions/action-core";
export { orgAction } from "@/lib/actions/org-action";

/**
 * Next.js server-action wrappers only. Fastify and the SPA use `orgActionHttp` /
 * `POST /api/v1/actions/:id` (no Next.js).
 */
type Options<S extends z.ZodType> = {
  id?: string;
  input: S;
  permission?: Permission;
};

export function userAction<S extends z.ZodType, R>(
  options: Omit<Options<S>, "permission" | "id">,
  run: (args: { input: z.output<S>; user: UserDTO }) => Promise<R>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> =>
    guardedNext(async () => {
      const session = await getSession();
      if (!session) return fail("unauthenticated", "Please sign in again.");
      const parsed = parse(options.input, raw);
      if (!parsed.ok) return parsed.result;
      const { id, name, email, image } = session.user;
      return ok(await run({ input: parsed.data, user: { id, name, email, image: image ?? null } }));
    });
}

export async function guarded<R>(fn: () => Promise<ActionResult<R>>): Promise<ActionResult<R>> {
  return guardedNext(fn);
}

async function guardedNext<R>(fn: () => Promise<ActionResult<R>>): Promise<ActionResult<R>> {
  try {
    return await guardedHttp(fn);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[action] unexpected error", error);
    return fail("internal", "Something went wrong on our side. Try again in a moment.");
  }
}
