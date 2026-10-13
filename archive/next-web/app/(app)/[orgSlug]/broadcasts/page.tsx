import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { BroadcastsView } from "@/components/broadcasts/broadcasts-view";
import { requireOrg } from "@/lib/dal";
import { listConnectionOptions } from "@/lib/services/audience-shared";
import { listBroadcasts } from "@/lib/services/broadcasts";

export const metadata: Metadata = { title: "Broadcasts" };

export default async function BroadcastsPage({ params }: PageProps<"/[orgSlug]/broadcasts">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  if (!ctx.can("broadcast:read")) notFound();
  const [broadcasts, connections] = await Promise.all([
    listBroadcasts(ctx),
    listConnectionOptions(ctx),
  ]);
  return (
    <>
      <PageHeader
        title="Broadcasts"
        description="Send one message to a whole segment, now or later."
      />
      <BroadcastsView
        orgSlug={orgSlug}
        broadcasts={broadcasts}
        connections={connections}
        canCreate={ctx.can("broadcast:create")}
      />
    </>
  );
}
