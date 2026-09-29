import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { ConnectionsView } from "@/components/connections/connections-view";
import { requireOrg } from "@/lib/dal";
import { getConnectionQuota, listConnections } from "@/lib/services/connections";

export const metadata: Metadata = { title: "Connections" };

export default async function ConnectionsPage({
  params,
}: PageProps<"/[orgSlug]/settings/connections">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const [connections, quota] = await Promise.all([listConnections(ctx), getConnectionQuota(ctx)]);

  return (
    <>
      <PageHeader
        title="Connections"
        description="Each connection is one Resend account. Wisemail listens to its events and keeps its data in sync."
      />
      <ConnectionsView
        orgSlug={orgSlug}
        connections={connections}
        quota={quota}
        can={{
          create: ctx.can("connection:create"),
          update: ctx.can("connection:update"),
          delete: ctx.can("connection:delete"),
        }}
      />
    </>
  );
}
