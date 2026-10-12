import "server-only";

import type { z } from "zod";

import type { OrgContext } from "@/lib/dal";
import { errorResponse, orgRoute } from "../_lib/org-api";

/**
 * POST plumbing for the AI endpoints: JSON only (`application/json` keeps them out of reach of
 * cross-site form posts, since a cross-origin JSON request needs a preflight we never grant),
 * Zod-validated body, org resolved from `?orgSlug=` with the usual membership check.
 */
export async function aiPost<S extends z.ZodType>(
  request: Request,
  schema: S,
  handler: (ctx: OrgContext, input: z.output<S>) => Promise<unknown>,
): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return errorResponse(415, "validation", "Send JSON with content-type application/json.");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "validation", "The request body isn't valid JSON.");
  }
  return orgRoute(request, ({ ctx }) => handler(ctx, schema.parse(body)));
}
