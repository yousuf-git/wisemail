import "server-only";

import { z } from "zod";

import { ForbiddenError, getOrgContext, type OrgContext } from "@/lib/dal";
import { RefError } from "@/lib/db/refs";
import { ServiceError } from "@/lib/services/errors";

/**
 * Shared plumbing for the session-authenticated `/api/v1` list endpoints (TRD §5). The org is
 * named by `?orgSlug=` and resolved server-side with a membership check: no session is 401, a
 * non-member (or unknown slug) is 404 so slugs cannot be probed, and org ids never come from
 * the request.
 */

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  validation: 400,
  forbidden: 403,
  conflict: 409,
};

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

export const errorResponse = (status: number, error: string, message: string, extra?: object) =>
  json({ error, message, ...extra }, status);

/** Turns a Zod failure into a 400 with per-field messages. */
export function validationResponse(error: z.ZodError) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    (fieldErrors[issue.path.join(".") || "_"] ??= []).push(issue.message);
  }
  return errorResponse(400, "validation", "Some parameters need another look.", { fieldErrors });
}

export type OrgRouteHandler = (args: {
  ctx: OrgContext;
  searchParams: URLSearchParams;
}) => Promise<unknown>;

/** Authenticates, resolves the org and runs `handler`; its return value is sent as JSON. */
export async function orgRoute(request: Request, handler: OrgRouteHandler): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const orgSlug = searchParams.get("orgSlug");
  if (!orgSlug) return errorResponse(400, "validation", "orgSlug is required.");

  try {
    const result = await getOrgContext(orgSlug);
    if (result.status === "unauthenticated") {
      return errorResponse(401, "unauthenticated", "Please sign in again.");
    }
    if (result.status === "not_member") {
      return errorResponse(404, "not_found", "We couldn't find that workspace.");
    }
    return json(await handler({ ctx: result.ctx, searchParams }));
  } catch (error) {
    if (error instanceof z.ZodError) return validationResponse(error);
    if (error instanceof ForbiddenError) {
      return errorResponse(403, "forbidden", error.message);
    }
    if (error instanceof ServiceError) {
      return errorResponse(
        STATUS_BY_CODE[error.code] ?? 400,
        error.code,
        error.message,
        error.fieldErrors ? { fieldErrors: error.fieldErrors } : undefined,
      );
    }
    if (error instanceof RefError) return errorResponse(404, "not_found", error.message);
    console.error("[api/v1] unexpected error", error);
    return errorResponse(500, "internal", "Something went wrong on our side.");
  }
}
