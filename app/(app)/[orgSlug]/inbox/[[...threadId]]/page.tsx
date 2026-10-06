import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { InboxView } from "@/components/inbox/inbox-view";
import { getMailFilterOptions } from "@/components/inbox/data";
import { parseInboxSegments } from "@/components/inbox/routes";
import { requireOrg } from "@/lib/dal";
import { ServiceError } from "@/lib/services/errors";
import { getThread, listThreads } from "@/lib/services/emails";
import { listSenders } from "@/lib/services/senders";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({ params }: PageProps<"/[orgSlug]/inbox/[[...threadId]]">) {
  const { orgSlug, threadId: segments } = await params;
  const route = parseInboxSegments(segments);
  if (!route) notFound();
  if (route.folder === "scheduled") redirect(`/${orgSlug}/scheduled`);

  const ctx = await requireOrg(orgSlug);
  const canSend = ctx.can("email:send");
  const folder = route.folder;

  // Filter options, list, open thread and senders are independent after auth.
  const [options, initialList, initialThread, senders] = await Promise.all([
    getMailFilterOptions(ctx),
    listThreads(ctx, { folder, limit: 30 }),
    route.threadId && folder !== "trash"
      ? getThread(ctx, route.threadId).catch((error) => {
          if (error instanceof ServiceError && error.code === "not_found") return notFound();
          throw error;
        })
      : Promise.resolve(null),
    canSend && ctx.can("sender:read") ? listSenders(ctx) : Promise.resolve([]),
  ]);
  const list = options.hasConnection ? initialList : { items: [], nextCursor: null };

  return (
    <InboxView
      key={folder}
      orgSlug={orgSlug}
      folder={folder}
      initialList={list}
      initialThread={initialThread}
      senders={senders}
      canSend={canSend}
      canTrash={ctx.can("thread:trash")}
      canDelete={ctx.can("email:delete")}
      hasConnection={options.hasConnection}
      canManageConnections={ctx.can("connection:create")}
    />
  );
}
