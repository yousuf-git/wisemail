import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";

import { listTime, useNow } from "@/components/inbox/format";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { duplicateTemplate } from "@/lib/actions";
import { listTemplates } from "@/lib/api";

export function TemplatesPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/templates" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const now = useNow();
  const data = useQuery({
    queryKey: ["templates", orgSlug],
    queryFn: () => listTemplates(orgSlug),
  });

  const writable = (data.data?.connections ?? []).filter((c) => c.writable);
  const canCreate = !!data.data?.can.create && writable.length > 0;

  const duplicate = useMutation({
    mutationFn: (id: string) => duplicateTemplate(orgSlug, id, writable[0]?.id),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["templates", orgSlug] });
      const id = (result.data as { id: string }).id;
      await navigate({ to: "/$orgSlug/templates/$templateId", params: { orgSlug, templateId: id } });
    },
  });

  return (
    <ResourcePage
      title="Templates"
      description="Reusable HTML emails with variables, filled in when you send."
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          {data.data ? `${data.data.templates.length} templates` : ""}
        </p>
        {canCreate ? (
          <Link
            to="/$orgSlug/templates/new"
            params={{ orgSlug }}
            className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent-fill px-3 text-xs font-semibold text-accent-ink"
          >
            <Plus className="size-3.5" aria-hidden /> New template
          </Link>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      {data.isPending ? (
        <ResourcePending />
      ) : data.isError ? (
        <ResourceError message="Could not load templates." />
      ) : (data.data?.connections.length ?? 0) === 0 ? (
        <ResourceEmpty>
          Connect a Resend account first.{" "}
          <Link
            to="/$orgSlug/settings/connections"
            params={{ orgSlug }}
            className="font-semibold text-accent-fill hover:underline"
          >
            Open Connections
          </Link>
        </ResourceEmpty>
      ) : data.data.templates.length === 0 ? (
        <ResourceEmpty>No templates yet.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {data.data.templates.map((row) => (
            <li key={row.id} className="flex items-stretch">
              <Link
                to="/$orgSlug/templates/$templateId"
                params={{ orgSlug, templateId: row.id }}
                className="min-w-0 flex-1 flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-canvas-sunken"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {row.subject || "No subject"}
                    {row.alias ? ` · ${row.alias}` : ""}
                    {` · ${row.connectionName}`}
                    {row.variableCount > 0 ? ` · ${row.variableCount} vars` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="block text-xs font-medium text-ink-secondary">{row.status}</span>
                  <time className="text-xs text-ink-faint">{listTime(row.updatedAt, now)}</time>
                </div>
              </Link>
              {canCreate ? (
                <button
                  type="button"
                  disabled={duplicate.isPending}
                  onClick={() => duplicate.mutate(row.id)}
                  className="shrink-0 border-l border-line px-3 text-xs font-medium text-ink-muted hover:bg-canvas-sunken disabled:opacity-50"
                >
                  Duplicate
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </ResourcePage>
  );
}
