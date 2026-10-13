import { listTemplateOptions } from "@/lib/services/templates";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/templates/options?orgSlug=` → published templates for compose Template mode. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => listTemplateOptions(ctx));
}
