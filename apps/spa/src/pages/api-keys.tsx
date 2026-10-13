import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { listApiKeys } from "@/lib/api";

export function ApiKeysPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/api-keys" });
  const keys = useQuery({
    queryKey: ["api-keys", orgSlug],
    queryFn: () => listApiKeys(orgSlug),
  });

  return (
    <ResourcePage title="API keys" description="`GET /api/v1/api-keys`">
      {keys.isPending ? (
        <ResourcePending />
      ) : keys.isError ? (
        <ResourceError message="Could not load API keys." />
      ) : keys.data.length === 0 ? (
        <ResourceEmpty>No API keys mirrored yet.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {keys.data.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {row.connectionName}
                  {row.permission ? ` · ${row.permission}` : ""}
                  {row.domainName ? ` · ${row.domainName}` : ""}
                </p>
              </div>
              <time className="shrink-0 text-xs text-ink-faint">
                {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}
              </time>
            </li>
          ))}
        </ul>
      )}
    </ResourcePage>
  );
}
