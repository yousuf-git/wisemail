import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { DomainsView } from "@/components/domains/domains-view";
import { requireOrg } from "@/lib/dal";
import { topics } from "@/lib/realtime/topics";
import { listDomains, listManageableConnections, listProjectChoices } from "@/lib/services/domains";

export const metadata: Metadata = { title: "Domains" };

export default async function DomainsPage({ params }: PageProps<"/[orgSlug]/domains">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const header = (
    <PageHeader
      title="Domains"
      description="Every domain across your Resend accounts: verification, DNS, tracking and receiving."
    />
  );
  if (!ctx.can("domain:read")) {
    return (
      <>
        {header}
        <EmptyState title="Domains are for the people who set up sending" mood="idle">
          Your role can&apos;t see domains. Ask an Owner or Admin if you need access.
        </EmptyState>
      </>
    );
  }

  const [domains, projects, connections] = await Promise.all([
    listDomains(ctx),
    listProjectChoices(ctx),
    ctx.can("domain:create") && ctx.can("connection:read")
      ? listManageableConnections(ctx)
      : Promise.resolve([]),
  ]);

  return (
    <>
      <LiveRefresh topics={[topics.domains(ctx.org.id)]} />
      {header}
      <DomainsView
        orgSlug={orgSlug}
        domains={domains}
        connections={connections}
        projects={projects}
        projectRequired={ctx.projectScope !== null}
        can={{
          create: ctx.can("domain:create"),
          update: ctx.can("domain:update"),
          assignProject: ctx.can("project:update"),
        }}
      />
    </>
  );
}
