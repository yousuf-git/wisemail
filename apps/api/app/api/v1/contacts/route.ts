import { listContacts } from "@/lib/services/contacts";
import { orgRoute } from "../_lib/org-api";
import { contactsQuery } from "../_lib/audience-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/contacts?orgSlug=&cursor=&limit=&q=&segmentId=&topicId=&connectionId=&status=` -> `Page<ContactRowDTO>`. */
export function GET(request: Request) {
  return orgRoute(request, ({ ctx, searchParams }) =>
    listContacts(ctx, contactsQuery.parse(Object.fromEntries(searchParams))),
  );
}
