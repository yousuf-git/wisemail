import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { TemplatesView } from "@/components/templates/templates-view";
import { requireOrg } from "@/lib/dal";
import { listConnectionOptions } from "@/lib/services/audience-shared";
import { listTemplates } from "@/lib/services/templates";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage({ params }: PageProps<"/[orgSlug]/templates">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  if (!ctx.can("template:read")) notFound();
  const [templates, connections] = await Promise.all([
    listTemplates(ctx),
    listConnectionOptions(ctx),
  ]);
  return (
    <>
      <PageHeader title="Templates" description="Write an email once, send it many times." />
      <TemplatesView
        orgSlug={orgSlug}
        templates={templates}
        connections={connections}
        can={{ create: ctx.can("template:create") }}
      />
    </>
  );
}
