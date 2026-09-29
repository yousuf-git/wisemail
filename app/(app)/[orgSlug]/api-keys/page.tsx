import type { Metadata } from "next";
import { Types } from "mongoose";

import { ApiKeysView } from "@/components/api-keys/api-keys-view";
import { EmptyState } from "@/components/app/empty-state";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { DomainModel } from "@/lib/db/models/domains";
import { topics } from "@/lib/realtime/topics";
import { listApiKeys } from "@/lib/services/api-keys";
import { listManageableConnections } from "@/lib/services/domains";
import { projectFilter } from "@/lib/services/project-scope";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiKeysPage({ params }: PageProps<"/[orgSlug]/api-keys">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const header = (
    <PageHeader
      title="API keys"
      description="The keys in your Resend accounts. Wisemail only keeps their names; a new key's secret is shown once."
    />
  );
  if (!ctx.can("apiKey:read")) {
    return (
      <>
        {header}
        <EmptyState title="API keys are for the people who set up sending" mood="idle">
          Your role can&apos;t see API keys. Ask an Owner or Admin if you need one.
        </EmptyState>
      </>
    );
  }

  const mayCreate = ctx.can("apiKey:create") || ctx.can("apiKey:createSending");
  await connectDb();
  const [keys, connections, domains] = await Promise.all([
    listApiKeys(ctx),
    mayCreate && ctx.can("connection:read") ? listManageableConnections(ctx) : Promise.resolve([]),
    mayCreate && ctx.can("domain:read")
      ? DomainModel.find(
          { orgId: new Types.ObjectId(ctx.org.id), ...projectFilter(ctx) },
          { name: 1, connectionId: 1 },
        )
          .sort({ name: 1 })
          .lean()
      : Promise.resolve([]),
  ]);

  return (
    <>
      <LiveRefresh topics={[topics.domains(ctx.org.id), "api_keys"]} />
      {header}
      <ApiKeysView
        orgSlug={orgSlug}
        keys={keys}
        connections={connections.map((c) => ({
          ...c,
          domains: domains
            .filter((d) => d.connectionId.toHexString() === c.id)
            .map((d) => ({ id: d._id.toHexString(), name: d.name })),
        }))}
        can={{
          create: ctx.can("apiKey:create"),
          createSending: ctx.can("apiKey:createSending"),
          delete: ctx.can("apiKey:delete"),
        }}
      />
    </>
  );
}
