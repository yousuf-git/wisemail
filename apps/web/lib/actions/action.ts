import "server-only";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { ForbiddenError, getOrgContext, getSession, type UserDTO } from "@/lib/dal";
import { getOrgContextFromHeaders } from "@/lib/dal-request";
import type { OrgContext } from "@/lib/dal-types";
import { roleHasPermission, type Permission } from "@/lib/auth/permissions";
import { RefError } from "@/lib/db/refs";
import { ServiceError } from "@/lib/services/errors";
import { registerOrgAction, type OrgActionFn } from "@/lib/actions/registry";
import { fail, ok, type ActionResult } from "./result";

/**
 * Server-action / HTTP wrapper (TRD §5): authenticate -> resolve org -> authorize ->
 * validate with Zod -> run -> typed result.
 *
 * `orgSlug` only *names* the org; membership and role are verified server-side.
 * Pass `headers` for Fastify / Route Handler calls; omit it in Next server actions (uses `dal`).
 */
export class ActionFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ActionFailure";
  }
}

type Options<S extends z.ZodType> = {
  /** When set, the action is callable via `POST /api/v1/actions/:id`. */
  id?: string;
  input: S;
  permission?: Permission;
};

export function userAction<S extends z.ZodType, R>(
  options: Omit<Options<S>, "permission" | "id">,
  run: (args: { input: z.output<S>; user: UserDTO }) => Promise<R>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> =>
    guarded(async () => {
      const session = await getSession();
      if (!session) return fail("unauthenticated", "Please sign in again.");
      const parsed = parse(options.input, raw);
      if (!parsed.ok) return parsed.result;
      const { id, name, email, image } = session.user;
      return ok(await run({ input: parsed.data, user: { id, name, email, image: image ?? null } }));
    });
}

export function orgAction<S extends z.ZodType, R>(
  options: Options<S>,
  run: (args: { input: z.output<S>; ctx: OrgContext }) => Promise<R>,
) {
  const fn = (async (orgSlug, raw, hdrs) =>
    guarded(async () => {
      const result = hdrs
        ? await getOrgContextFromHeaders(orgSlug, hdrs)
        : await getOrgContext(orgSlug);
      if (result.status === "unauthenticated") {
        return fail("unauthenticated", "Please sign in again.");
      }
      if (result.status === "not_member") {
        return fail("not_found", "We couldn't find that workspace.");
      }
      if (result.status === "suspended") {
        return fail(
          "workspace_suspended",
          "This workspace is suspended. Contact Wisemail support.",
        );
      }
      const { ctx } = result;
      if (options.permission && !roleHasPermission(ctx.role, options.permission)) {
        return fail("forbidden", "You don't have permission to do that.");
      }
      const parsed = parse(options.input, raw);
      if (!parsed.ok) return parsed.result;
      return ok(await run({ input: parsed.data as z.output<S>, ctx }));
    })) as OrgActionFn & ((orgSlug: string, raw: z.input<S>) => Promise<ActionResult<R>>);

  if (options.id) registerOrgAction(options.id, fn);
  return fn as (orgSlug: string, raw: z.input<S>, headers?: Headers) => Promise<ActionResult<R>>;
}

export function parse<S extends z.ZodType>(schema: S, raw: unknown) {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true as const, data: result.data as z.output<S> };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return {
    ok: false as const,
    result: fail("validation", "Some fields need another look.", fieldErrors),
  };
}

export async function guarded<R>(fn: () => Promise<ActionResult<R>>): Promise<ActionResult<R>> {
  try {
    return await fn();
  } catch (error) {
    unstable_rethrow(error); // redirect() / notFound() inside `run` must keep working
    if (error instanceof ActionFailure) return fail(error.code, error.message, error.fieldErrors);
    if (error instanceof ForbiddenError) {
      return fail("forbidden", "You don't have permission to do that.");
    }
    if (error instanceof ServiceError) return fail(error.code, error.message, error.fieldErrors);
    if (error instanceof RefError) return fail("not_found", error.message);
    console.error("[action] unexpected error", error);
    return fail("internal", "Something went wrong on our side. Try again in a moment.");
  }
}
