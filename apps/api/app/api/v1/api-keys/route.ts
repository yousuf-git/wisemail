import { listApiKeys } from "@/lib/services/api-keys";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/api-keys?orgSlug=` → mirrored API keys. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => listApiKeys(ctx));
}
