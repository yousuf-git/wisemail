import { getTemplate } from "@/lib/services/templates";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/templates/[templateId]?orgSlug=` → `TemplateDTO`. */
export async function GET(request: Request, route: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await route.params;
  return orgRoute(request, ({ ctx }) => getTemplate(ctx, templateId));
}
