import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { getNotificationPrefs } from "@/lib/api";

export function SettingsNotificationsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/notifications" });
  const prefs = useQuery({
    queryKey: ["settings", "notifications", orgSlug],
    queryFn: () => getNotificationPrefs(orgSlug),
  });

  return (
    <ResourcePage title="Notifications" description="`GET /api/v1/settings/notifications`">
      {prefs.isPending ? (
        <ResourcePending />
      ) : prefs.isError ? (
        <ResourceError message="Could not load notification preferences." />
      ) : !prefs.data ? (
        <ResourceEmpty>No preferences.</ResourceEmpty>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-ink-muted">
            Plan {prefs.data.planLabel} · org timezone {prefs.data.orgTimezone} · digest{" "}
            {prefs.data.digest}
            {prefs.data.quietHours
              ? ` · quiet ${prefs.data.quietHours.start}–${prefs.data.quietHours.end}`
              : ""}
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {Object.entries(prefs.data.channels).map(([key, ch]) => (
              <li key={key} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <p className="text-sm font-medium">{key}</p>
                <p className="text-xs text-ink-secondary">
                  {ch.inApp ? "in-app" : "—"}
                  {" · "}
                  {ch.email ? "email" : "—"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ResourcePage>
  );
}
