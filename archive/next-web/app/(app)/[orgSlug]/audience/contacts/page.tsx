import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { ContactsView } from "@/components/audience/contacts-view";
import { EMPTY_CONTACT_FILTERS, type ContactFilters } from "@/components/audience/api";
import { requireOrg } from "@/lib/dal";
import { listAudienceOptions, listContacts } from "@/lib/services/contacts";

export const metadata: Metadata = { title: "Contacts" };

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export default async function ContactsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/audience/contacts">) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const ctx = await requireOrg(orgSlug);
  const options = await listAudienceOptions(ctx);

  const one = (key: string) => {
    const raw = query[key];
    return (Array.isArray(raw) ? raw[0] : raw) ?? "";
  };
  const initialFilters: ContactFilters = {
    ...EMPTY_CONTACT_FILTERS,
    segmentId: OBJECT_ID.test(one("segmentId")) ? one("segmentId") : "",
    topicId: OBJECT_ID.test(one("topicId")) ? one("topicId") : "",
    connectionId: OBJECT_ID.test(one("connectionId")) ? one("connectionId") : "",
  };
  const initialPage =
    options.connections.length > 0
      ? await listContacts(ctx, {
          limit: 50,
          segmentId: initialFilters.segmentId || undefined,
          topicId: initialFilters.topicId || undefined,
          connectionId: initialFilters.connectionId || undefined,
        })
      : null;

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Everyone in your Resend accounts, with their segments and topic choices."
      />
      <ContactsView
        orgSlug={orgSlug}
        options={options}
        initialPage={initialPage}
        initialFilters={initialFilters}
        can={{ create: ctx.can("contact:create"), import: ctx.can("contact:import") }}
      />
    </>
  );
}
