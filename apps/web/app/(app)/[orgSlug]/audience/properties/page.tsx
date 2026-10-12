import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { PropertiesView } from "@/components/audience/properties-view";
import { requireOrg } from "@/lib/dal";
import { listConnectionOptions } from "@/lib/services/audience-shared";
import { listContactProperties } from "@/lib/services/contact-properties";

export const metadata: Metadata = { title: "Contact properties" };

export default async function PropertiesPage({
  params,
}: PageProps<"/[orgSlug]/audience/properties">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  if (!ctx.can("audience:read")) notFound();
  const [properties, connections] = await Promise.all([
    listContactProperties(ctx),
    listConnectionOptions(ctx),
  ]);
  return (
    <>
      <PageHeader title="Contact properties" description="Extra fields on every contact." />
      <PropertiesView
        orgSlug={orgSlug}
        properties={properties}
        connections={connections}
        canManage={ctx.can("audience:manage")}
      />
    </>
  );
}
