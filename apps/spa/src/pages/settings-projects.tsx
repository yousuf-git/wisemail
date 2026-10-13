import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { listProjects } from "@/lib/api";

export function SettingsProjectsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/projects" });
  const projects = useQuery({
    queryKey: ["projects", orgSlug],
    queryFn: () => listProjects(orgSlug),
  });

  return (
    <ResourcePage title="Projects" description="`GET /api/v1/projects`">
      {projects.isPending ? (
        <ResourcePending />
      ) : projects.isError ? (
        <ResourceError message="Could not load projects." />
      ) : projects.data.length === 0 ? (
        <ResourceEmpty>No projects yet.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {projects.data.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {row.slug}
                  {row.description ? ` · ${row.description}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs text-ink-secondary">
                {row.domainCount} domains · {row.scopedMemberCount} scoped
              </span>
            </li>
          ))}
        </ul>
      )}
    </ResourcePage>
  );
}
