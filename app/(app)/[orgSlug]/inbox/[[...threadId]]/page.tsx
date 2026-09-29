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
  const options = await getMailFilterOptions(ctx);
  const canSend = ctx.can("email:send");
  const folder = route.folder;

  const [initialList, initialThread, senders] = await Promise.all([
    options.hasConnection
      ? listThreads(ctx, { folder, limit: 30 })
      : Promise.resolve({ items: [], nextCursor: null }),
    route.threadId && folder !== "trash"
      ? getThread(ctx, route.threadId).catch((error) => {
          if (error instanceof ServiceError && error.code === "not_found") return notFound();
          throw error;
        })
      : Promise.resolve(null),
    canSend && ctx.can("sender:read") ? listSenders(ctx) : Promise.resolve([]),
  ]);

  return (
    <InboxView
      key={folder}
      orgSlug={orgSlug}
      folder={folder}
      initialList={initialList}
      initialThread={initialThread}
      senders={senders}
      canSend={canSend}
      canTrash={ctx.can("thread:trash")}
      hasConnection={options.hasConnection}
      canManageConnections={ctx.can("connection:create")}
    />
  );
}
