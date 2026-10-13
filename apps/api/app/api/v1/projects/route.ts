import { listProjects } from "@/lib/services/projects";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/projects?orgSlug=` → projects. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => listProjects(ctx));
}
