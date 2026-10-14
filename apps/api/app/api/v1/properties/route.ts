import { listContactProperties } from "@/lib/services/contact-properties";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/properties?orgSlug=&connectionId=` → `PropertyDTO[]`. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx, searchParams }) => {
    const connectionId = searchParams.get("connectionId") || undefined;
    return listContactProperties(ctx, { connectionId });
  });
}
