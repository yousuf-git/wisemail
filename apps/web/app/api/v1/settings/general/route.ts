import { getGeneralSettings } from "@/lib/services/general-settings";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/settings/general?orgSlug=` → workspace name / slug / timezone. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => getGeneralSettings(ctx));
}
