import { getContact } from "@/lib/services/contacts";
import { orgRoute } from "../../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/contacts/[contactId]?orgSlug=` → `ContactDetailDTO`. */
export async function GET(request: Request, route: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await route.params;
  return orgRoute(request, ({ ctx }) => getContact(ctx, contactId));
}
