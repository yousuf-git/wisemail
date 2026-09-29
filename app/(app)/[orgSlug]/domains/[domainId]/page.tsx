import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BreadcrumbLabel } from "@/components/app/breadcrumb-label";
import { LiveRefresh } from "@/components/app/live-refresh";
import { DomainDetailView } from "@/components/domains/domain-detail-view";
import { requireOrg } from "@/lib/dal";
import { topics } from "@/lib/realtime/topics";
import { getDomain, listProjectChoices } from "@/lib/services/domains";
import { ServiceError } from "@/lib/services/errors";

export const metadata: Metadata = { title: "Domain" };

export default async function DomainPage({ params }: PageProps<"/[orgSlug]/domains/[domainId]">) {
  const { orgSlug, domainId } = await params;
  const ctx = await requireOrg(orgSlug);
  if (!ctx.can("domain:read")) notFound();

  const domain = await getDomain(ctx, domainId).catch((error) => {
    if (error instanceof ServiceError && error.code === "not_found") return null;
    throw error;
  });
  if (!domain) notFound();
  const projects = await listProjectChoices(ctx);

  return (
    <>
      <BreadcrumbLabel segment={domainId} label={domain.name} />
      <LiveRefresh topics={[topics.domains(ctx.org.id)]} />
      <DomainDetailView
        orgSlug={orgSlug}
        domain={domain}
        projects={projects}
        can={{
          create: ctx.can("domain:create"),
          update: ctx.can("domain:update"),
          verify: ctx.can("domain:verify"),
          delete: ctx.can("domain:delete"),
          assignProject: ctx.can("project:update"),
        }}
      />
    </>
  );
}
