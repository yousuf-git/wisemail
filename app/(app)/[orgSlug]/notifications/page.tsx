import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { NotificationsView } from "@/components/notifications/notifications-view";
import { requireOrg } from "@/lib/dal";
import { listNotifications } from "@/lib/services/notifications";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ params }: PageProps<"/[orgSlug]/notifications">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const initial = await listNotifications(ctx, { limit: 30 });
  return (
    <>
      <PageHeader
        title="Notifications"
        description="What happened while you were away: new mail, alerts, and changes to your domains and connections."
      />
      <NotificationsView
        orgSlug={orgSlug}
        orgId={ctx.org.id}
        userId={ctx.user.id}
        initial={initial}
      />
    </>
  );
}
