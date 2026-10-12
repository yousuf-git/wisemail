import { z } from "zod";

import { listIncidents } from "@/lib/services/alerts";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const query = z.object({
  status: z.enum(["active", "resolved", "all"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** `GET /api/v1/incidents?orgSlug=&status=active|resolved|all` -> `IncidentDTO[]`. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx, searchParams }) =>
    listIncidents(ctx, query.parse(Object.fromEntries(searchParams))),
  );
}
