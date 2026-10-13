import { listTemplates } from "@/lib/services/templates";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/templates?orgSlug=` → template rows. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => listTemplates(ctx));
}
