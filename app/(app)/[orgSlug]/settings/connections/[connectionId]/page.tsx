import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ConnectionDetailView } from "@/components/connections/connection-detail-view";
import { requireOrg } from "@/lib/dal";
import { getConnectionDetail } from "@/lib/services/connection-detail";
import { ServiceError } from "@/lib/services/errors";

export const metadata: Metadata = { title: "Connection" };

export default async function ConnectionPage({
  params,
}: PageProps<"/[orgSlug]/settings/connections/[connectionId]">) {
  const { orgSlug, connectionId } = await params;
  const ctx = await requireOrg(orgSlug);
  const connection = await getConnectionDetail(ctx, connectionId).catch((error) => {
    if (error instanceof ServiceError && error.code === "not_found") return null;
    throw error;
  });
  if (!connection) notFound();

  return (
    <ConnectionDetailView
      orgSlug={orgSlug}
      connection={connection}
      can={{
        update: ctx.can("connection:update"),
        domainUpdate: ctx.can("domain:update"),
      }}
    />
  );
}
