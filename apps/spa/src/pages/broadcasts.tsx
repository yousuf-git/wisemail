import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { listBroadcasts } from "@/lib/api";

export function BroadcastsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/broadcasts" });
  const broadcasts = useQuery({
    queryKey: ["broadcasts", orgSlug],
    queryFn: () => listBroadcasts(orgSlug),
  });

  return (
    <ResourcePage title="Broadcasts" description="`GET /api/v1/broadcasts`">
      {broadcasts.isPending ? (
        <ResourcePending />
      ) : broadcasts.isError ? (
        <ResourceError message="Could not load broadcasts." />
      ) : broadcasts.data.length === 0 ? (
        <ResourceEmpty>No broadcasts yet.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {broadcasts.data.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {row.subject || "No subject"}
                  {row.segmentName ? ` · ${row.segmentName}` : ""}
                  {` · ${row.connectionName}`}
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-ink-secondary">{row.status}</span>
            </li>
          ))}
        </ul>
      )}
    </ResourcePage>
  );
}
