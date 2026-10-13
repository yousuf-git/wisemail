import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { listDomains } from "@/lib/api";

export function DomainsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/domains" });
  const domains = useQuery({
    queryKey: ["domains", orgSlug],
    queryFn: () => listDomains(orgSlug),
  });

  return (
    <ResourcePage title="Domains" description="`GET /api/v1/domains`">
      {domains.isPending ? (
        <ResourcePending />
      ) : domains.isError ? (
        <ResourceError message="Could not load domains." />
      ) : domains.data.length === 0 ? (
        <ResourceEmpty>No domains mirrored yet.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {domains.data.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {row.connectionName}
                  {row.openTracking ? " · open tracking" : ""}
                  {row.receivingEnabled ? " · receiving" : ""}
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
