import type { Metadata } from "next";
import { Types } from "mongoose";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SendersView, type SenderDomainOption } from "@/components/senders/senders-view";
import { requireOrg } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { DomainModel } from "@/lib/db/models/domains";
import { canSeeProject } from "@/lib/services/project-scope";
import { listSenders } from "@/lib/services/senders";

export const metadata: Metadata = { title: "Senders" };

export default async function SendersPage({ params }: PageProps<"/[orgSlug]/settings/senders">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const header = (
    <PageHeader
      title="Senders"
      description="A sender is an address on a verified domain, like support@yourdomain.com. Pick one whenever you write."
    />
  );
  if (!ctx.can("sender:read")) {
    return (
      <>
        {header}
        <EmptyState title="Senders are for teammates who send" mood="idle">
          Your role can&apos;t see senders. Ask an Owner or Admin if you need one.
        </EmptyState>
      </>
    );
  }

  await connectDb();
  const [senders, domainDocs] = await Promise.all([
    listSenders(ctx),
    DomainModel.find(
      { orgId: new Types.ObjectId(ctx.org.id), status: "verified" },
      { name: 1, projectId: 1, receiving: 1 },
    )
      .sort({ name: 1 })
      .lean(),
  ]);
  const domains: SenderDomainOption[] = domainDocs
    .filter((d) => canSeeProject(ctx, d.projectId?.toHexString() ?? null))
    .map((d) => ({ id: d._id.toHexString(), name: d.name, receiving: !!d.receiving?.enabled }));

  return (
    <>
      {header}
      <SendersView
        orgSlug={orgSlug}
        senders={senders}
        domains={domains}
        can={{
          create: ctx.can("sender:create"),
          update: ctx.can("sender:update"),
          delete: ctx.can("sender:delete"),
        }}
      />
    </>
  );
}
