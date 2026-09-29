import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { TemplateEditor } from "@/components/templates/template-editor";
import { requireOrg } from "@/lib/dal";
import { listConnectionOptions } from "@/lib/services/audience-shared";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage({ params }: PageProps<"/[orgSlug]/templates/new">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  if (!ctx.can("template:create")) notFound();
  const connections = await listConnectionOptions(ctx);
  return (
    <>
      <PageHeader
        title="New template"
        description="Write the HTML, declare the variables, preview it, then publish."
      />
      <TemplateEditor
        orgSlug={orgSlug}
        template={null}
        connections={connections}
        canEdit
        canCreate
        canDelete={false}
      />
    </>
  );
}
