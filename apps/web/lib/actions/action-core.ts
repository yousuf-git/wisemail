import "server-only";

import { z } from "zod";

import { ForbiddenError } from "@/lib/dal-types";
import { getOrgContextFromHeaders } from "@/lib/dal-request";
import type { OrgContext } from "@/lib/dal-types";
import { roleHasPermission, type Permission } from "@/lib/auth/permissions";
import { RefError } from "@/lib/db/refs";
import { ServiceError } from "@/lib/services/errors";
import { registerOrgAction, type OrgActionFn } from "@/lib/actions/registry";
import { runWithRequestHeadersAsync } from "@/lib/request-context";
import { fail, ok, type ActionResult } from "./result";

/** Framework-agnostic action failure (no Next.js). */
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
  id?: string;
  input: S;
  permission?: Permission;
};

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

/**
 * Maps known domain errors to `ActionResult`. Unknown errors are rethrown (Next redirects, etc.).
 */
export async function guardedHttp<R>(fn: () => Promise<ActionResult<R>>): Promise<ActionResult<R>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ActionFailure) return fail(error.code, error.message, error.fieldErrors);
    if (error instanceof ForbiddenError) {
      return fail("forbidden", "You don't have permission to do that.");
    }
    if (error instanceof ServiceError) return fail(error.code, error.message, error.fieldErrors);
    if (error instanceof RefError) return fail("not_found", error.message);
    throw error;
  }
}

/**
 * Org mutation that always takes request `Headers` (Fastify / fetch). Registers on `id` when set.
 */
export function orgActionHttp<S extends z.ZodType, R>(
  options: Options<S>,
  run: (args: { input: z.output<S>; ctx: OrgContext }) => Promise<R>,
) {
  const fn: OrgActionFn = async (orgSlug, raw, hdrs) => {
    if (!hdrs) {
      return fail("internal", "Action requires request headers.");
    }
    return runWithRequestHeadersAsync(hdrs, () =>
      guardedHttp(async () => {
        const result = await getOrgContextFromHeaders(orgSlug, hdrs);
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
      }),
    );
  };

  if (options.id) registerOrgAction(options.id, fn);
  return fn as (orgSlug: string, raw: z.input<S>, headers: Headers) => Promise<ActionResult<R>>;
}
