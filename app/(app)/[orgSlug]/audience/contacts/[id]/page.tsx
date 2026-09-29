import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BreadcrumbLabel } from "@/components/app/breadcrumb-label";
import { ContactDetail } from "@/components/audience/contact-detail";
import { requireOrg } from "@/lib/dal";
import { getContact } from "@/lib/services/contacts";
import { ServiceError } from "@/lib/services/errors";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage({
  params,
}: PageProps<"/[orgSlug]/audience/contacts/[id]">) {
  const { orgSlug, id } = await params;
  const ctx = await requireOrg(orgSlug);
  const contact = await getContact(ctx, id).catch((error) => {
    if (error instanceof ServiceError && error.code === "not_found") return notFound();
    throw error;
  });

  return (
    <>
      <BreadcrumbLabel segment={id} label={contact.email} />
      <ContactDetail
        orgSlug={orgSlug}
        contact={contact}
        can={{
          update: ctx.can("contact:update"),
          unsubscribe: ctx.can("contact:unsubscribe"),
          delete: ctx.can("contact:delete"),
          activity: ctx.can("activity:read"),
        }}
      />
    </>
  );
}
