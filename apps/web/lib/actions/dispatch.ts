import "server-only";

import { z } from "zod";

import { getOrgAction } from "@/lib/actions/registry";
import { fail, type ActionResult } from "@/lib/actions/result";

const bodySchema = z.object({
  orgSlug: z.string().min(1).max(64),
  input: z.unknown(),
});

/** Run a registered org action from an HTTP request. */
export async function dispatchOrgAction(
  id: string,
  rawBody: unknown,
  headers: Headers,
): Promise<{ status: number; body: ActionResult<unknown> }> {
  const action = getOrgAction(id);
  if (!action) {
    return {
      status: 404,
      body: fail("not_found", "Unknown action."),
    };
  }
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      status: 400,
      body: fail("validation", "orgSlug and input are required."),
    };
  }
  const result = await action(parsed.data.orgSlug, parsed.data.input, headers);
  const status =
    result.ok
      ? 200
      : result.error.code === "unauthenticated"
        ? 401
        : result.error.code === "forbidden" || result.error.code === "workspace_suspended"
          ? 403
          : result.error.code === "not_found"
            ? 404
            : result.error.code === "validation"
              ? 400
              : 400;
  return { status, body: result };
}
