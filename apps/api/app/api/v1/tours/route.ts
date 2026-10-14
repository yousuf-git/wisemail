import { getTourBootstrap } from "@/lib/tours/progress";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/tours?orgSlug=` → tour bootstrap for the signed-in member. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx }) => getTourBootstrap(ctx));
}
