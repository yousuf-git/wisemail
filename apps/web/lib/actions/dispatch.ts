import "server-only";

import { z } from "zod";

import { getAdminAction, getOrgAction, getUserAction } from "@/lib/actions/registry";
import { fail, type ActionResult } from "@/lib/actions/result";

const orgBodySchema = z.object({
  orgSlug: z.string().min(1).max(64),
  input: z.unknown(),
});

const inputBodySchema = z.object({
  input: z.unknown(),
});

function statusFor(result: ActionResult<unknown>): number {
  if (result.ok) return 200;
  switch (result.error.code) {
    case "unauthenticated":
      return 401;
    case "forbidden":
    case "workspace_suspended":
      return 403;
    case "not_found":
      return 404;
    case "validation":
      return 400;
    default:
      return 400;
  }
}

/** Run a registered org action from an HTTP request. */
export async function dispatchOrgAction(
  id: string,
  rawBody: unknown,
  headers: Headers,
): Promise<{ status: number; body: ActionResult<unknown> }> {
  const action = getOrgAction(id);
  if (!action) {
    return { status: 404, body: fail("not_found", "Unknown action.") };
  }
  const parsed = orgBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: fail("validation", "orgSlug and input are required.") };
  }
  try {
    const result = await action(parsed.data.orgSlug, parsed.data.input, headers);
    return { status: statusFor(result), body: result };
  } catch (error) {
    console.error("[actions] unexpected error", error);
    return {
      status: 500,
      body: fail("internal", "Something went wrong on our side. Try again in a moment."),
    };
  }
}

export async function dispatchUserAction(
  id: string,
  rawBody: unknown,
  headers: Headers,
): Promise<{ status: number; body: ActionResult<unknown> }> {
  const action = getUserAction(id);
  if (!action) {
    return { status: 404, body: fail("not_found", "Unknown action.") };
  }
  const parsed = inputBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: fail("validation", "input is required.") };
  }
  try {
    const result = await action(parsed.data.input, headers);
    return { status: statusFor(result), body: result };
  } catch (error) {
    console.error("[user-actions] unexpected error", error);
    return {
      status: 500,
      body: fail("internal", "Something went wrong on our side. Try again in a moment."),
    };
  }
}

export async function dispatchAdminAction(
  id: string,
  rawBody: unknown,
  headers: Headers,
): Promise<{ status: number; body: ActionResult<unknown> }> {
  const action = getAdminAction(id);
  if (!action) {
    return { status: 404, body: fail("not_found", "Unknown action.") };
  }
  const parsed = inputBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: fail("validation", "input is required.") };
  }
  try {
    const result = await action(parsed.data.input, headers);
    return { status: statusFor(result), body: result };
  } catch (error) {
    console.error("[admin-actions] unexpected error", error);
    return {
      status: 500,
      body: fail("internal", "Something went wrong on our side. Try again in a moment."),
    };
  }
}
