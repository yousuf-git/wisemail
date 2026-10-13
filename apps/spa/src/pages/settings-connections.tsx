import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { listConnections } from "@/lib/api";

export function SettingsConnectionsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/connections" });
  const connections = useQuery({
    queryKey: ["connections", orgSlug],
    queryFn: () => listConnections(orgSlug),
  });

  return (
    <ResourcePage title="Connections" description="`GET /api/v1/connections`">
      {connections.isPending ? (
        <ResourcePending />
      ) : connections.isError ? (
        <ResourceError message="Could not load connections." />
      ) : connections.data.length === 0 ? (
        <ResourceEmpty>No Resend connections yet.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {connections.data.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {row.apiKeyLast4 ? `…${row.apiKeyLast4}` : "no key hint"}
                  {row.lastSyncAt
                    ? ` · synced ${new Date(row.lastSyncAt).toLocaleString()}`
                    : " · never synced"}
                </p>
                {row.statusReason ? (
                  <p className="mt-0.5 text-xs text-warning-ink">{row.statusReason}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-xs font-medium text-ink-secondary">{row.status}</span>
            </li>
          ))}
        </ul>
      )}
    </ResourcePage>
  );
}
