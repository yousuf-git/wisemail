import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BreadcrumbLabel } from "@/components/app/breadcrumb-label";
import { PageHeader } from "@/components/app/page-header";
import { TemplateEditor } from "@/components/templates/template-editor";
import { requireOrg } from "@/lib/dal";
import { ServiceError } from "@/lib/services/errors";
import { listConnectionOptions } from "@/lib/services/audience-shared";
import { getTemplate } from "@/lib/services/templates";

export const metadata: Metadata = { title: "Template" };

export default async function TemplatePage({ params }: PageProps<"/[orgSlug]/templates/[id]">) {
  const { orgSlug, id } = await params;
  const ctx = await requireOrg(orgSlug);
  if (!ctx.can("template:read")) notFound();
  const template = await getTemplate(ctx, id).catch((error) => {
    if (error instanceof ServiceError && error.code === "not_found") return notFound();
    throw error;
  });
  const connections = await listConnectionOptions(ctx);
  return (
    <>
      <BreadcrumbLabel segment={id} label={template.name} />
      <PageHeader
        title={template.name}
        description={`${template.connectionName}${template.alias ? ` · alias ${template.alias}` : ""}`}
      />
      <TemplateEditor
        key={template.id}
        orgSlug={orgSlug}
        template={template}
        connections={connections}
        canEdit={ctx.can("template:update")}
        canCreate={ctx.can("template:create")}
        canDelete={ctx.can("template:delete")}
      />
    </>
  );
}
