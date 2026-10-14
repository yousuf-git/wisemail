import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { PreferencesForm } from "@/components/notifications/preferences-form";
import {
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { getNotificationPrefs } from "@/lib/api";

export function SettingsNotificationsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/notifications" });
  const queryClient = useQueryClient();
  const prefs = useQuery({
    queryKey: ["settings", "notifications", orgSlug],
    queryFn: () => getNotificationPrefs(orgSlug),
  });

  return (
    <ResourcePage
      title="Notifications"
      description="Choose what reaches you, and where. These settings are yours alone."
    >
      {prefs.isPending ? (
        <ResourcePending />
      ) : prefs.isError ? (
        <ResourceError message="Could not load notification preferences." />
      ) : (
        <PreferencesForm
          orgSlug={orgSlug}
          initial={prefs.data}
          onSaved={() => {
            void queryClient.invalidateQueries({
              queryKey: ["settings", "notifications", orgSlug],
            });
          }}
        />
      )}
    </ResourcePage>
  );
}
