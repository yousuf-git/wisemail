import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { getMailFilterOptions } from "@/components/inbox/data";
import { ScheduledView } from "@/components/inbox/scheduled-view";
import { requireOrg } from "@/lib/dal";
import { listThreads } from "@/lib/services/emails";

export const metadata: Metadata = { title: "Scheduled" };

export default async function ScheduledPage({ params }: PageProps<"/[orgSlug]/scheduled">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const options = await getMailFilterOptions(ctx);
  const initialList = options.hasConnection
    ? await listThreads(ctx, { folder: "scheduled", limit: 30 })
    : { items: [], nextCursor: null };

  return (
    <>
      <PageHeader
        title="Scheduled"
        description="Emails waiting for their send time. Change the time or cancel until Resend sends them."
      />
      <ScheduledView
        orgSlug={orgSlug}
        initialList={initialList}
        canSend={ctx.can("email:send")}
        hasConnection={options.hasConnection}
        canManageConnections={ctx.can("connection:create")}
      />
    </>
  );
}
