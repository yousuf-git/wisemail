import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { listIncidents } from "@/lib/api";

export function AlertsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/alerts" });
  const incidents = useQuery({
    queryKey: ["incidents", orgSlug],
    queryFn: () => listIncidents(orgSlug, "active"),
  });

  return (
    <ResourcePage title="Alerts" description="Open incidents · `GET /api/v1/incidents`">
      {incidents.isPending ? (
        <ResourcePending />
      ) : incidents.isError ? (
        <ResourceError message="Could not load incidents." />
      ) : incidents.data.length === 0 ? (
        <ResourceEmpty>No open incidents.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {incidents.data.map((row) => (
            <li key={row.id} className="grid gap-1 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-semibold">{row.title}</p>
                <span className="shrink-0 text-xs font-medium text-warning-ink">{row.status}</span>
              </div>
              <p className="text-xs text-ink-muted">
                {row.ruleName} · opened {new Date(row.openedAt).toLocaleString()}
              </p>
              {row.summary ? <p className="text-sm text-ink-secondary">{row.summary}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </ResourcePage>
  );
}
