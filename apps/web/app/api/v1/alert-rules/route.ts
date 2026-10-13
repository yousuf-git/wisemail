import { listAlertRules } from "@/lib/services/alerts";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/alert-rules?orgSlug=` → alert rules. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => listAlertRules(ctx));
}
