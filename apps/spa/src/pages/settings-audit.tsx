import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { listAuditLog } from "@/lib/api";

export function SettingsAuditPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/audit" });
  const audit = useQuery({
    queryKey: ["audit", orgSlug],
    queryFn: () => listAuditLog(orgSlug),
  });

  return (
    <ResourcePage title="Audit log" description="`GET /api/v1/audit`">
      {audit.isPending ? (
        <ResourcePending />
      ) : audit.isError ? (
        <ResourceError message="Could not load the audit log (permission or API)." />
      ) : audit.data.items.length === 0 ? (
        <ResourceEmpty>No audit entries in range.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {audit.data.items.map((row) => (
            <li key={row.id} className="grid gap-0.5 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-medium">{row.action}</p>
                <time className="shrink-0 text-xs text-ink-faint">
                  {new Date(row.createdAt).toLocaleString()}
                </time>
              </div>
              <p className="truncate text-xs text-ink-muted">
                {row.actor.name || row.actor.type}
                {row.target.type ? ` · ${row.target.type}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </ResourcePage>
  );
}
