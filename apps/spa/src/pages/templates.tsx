import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { listTemplates } from "@/lib/api";

export function TemplatesPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/templates" });
  const templates = useQuery({
    queryKey: ["templates", orgSlug],
    queryFn: () => listTemplates(orgSlug),
  });

  return (
    <ResourcePage title="Templates" description="`GET /api/v1/templates`">
      {templates.isPending ? (
        <ResourcePending />
      ) : templates.isError ? (
        <ResourceError message="Could not load templates." />
      ) : templates.data.length === 0 ? (
        <ResourceEmpty>No templates synced yet.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {templates.data.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {row.subject || "No subject"}
                  {row.alias ? ` · ${row.alias}` : ""}
                  {` · ${row.connectionName}`}
                  {row.variableCount > 0 ? ` · ${row.variableCount} vars` : ""}
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
