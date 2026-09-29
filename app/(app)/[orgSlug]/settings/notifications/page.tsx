import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { PreferencesForm } from "@/components/notifications/preferences-form";
import { requireOrg } from "@/lib/dal";
import { getNotificationPreferences } from "@/lib/services/notifications";

export const metadata: Metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage({
  params,
}: PageProps<"/[orgSlug]/settings/notifications">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const initial = await getNotificationPreferences(ctx);
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Choose what reaches you, and where. These settings are yours alone."
      />
      <PreferencesForm orgSlug={orgSlug} initial={initial} isOwner={ctx.can("billing:manage")} />
    </>
  );
}
