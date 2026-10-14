import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { REGIONS, domainStatus, needsAttention } from "@/components/domains/domain-status";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import {
  assignDomainProject,
  createDomain,
  setDomainTracking,
} from "@/lib/actions";
import { listDomains, type DomainRow } from "@/lib/api";
import { cn } from "@/lib/utils";

export function DomainsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/domains" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [connection, setConnection] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = useQuery({
    queryKey: ["domains", orgSlug],
    queryFn: () => listDomains(orgSlug),
  });

  const domains = data.data?.domains ?? [];
  const shown = useMemo(
    () =>
      domains.filter(
        (d) =>
          (!query.trim() || d.name.includes(query.trim().toLowerCase())) &&
          (!connection || d.connectionId === connection) &&
          (!attentionOnly || needsAttention(d)),
      ),
    [domains, query, connection, attentionOnly],
  );

  const connectionNames = useMemo(
    () => [...new Map(domains.map((d) => [d.connectionId, d.connectionName])).entries()],
    [domains],
  );
  const attention = domains.filter(needsAttention).length;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["domains", orgSlug] });

  const create = useMutation({
    mutationFn: (input: {
      connectionId: string;
      name: string;
      region: string;
      projectId?: string | null;
    }) => createDomain(orgSlug, input),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setAdding(false);
      await invalidate();
      const id = (result.data as DomainRow).id;
      await navigate({ to: "/$orgSlug/domains/$domainId", params: { orgSlug, domainId: id } });
    },
  });

  const tracking = useMutation({
    mutationFn: (input: {
      domainId: string;
      openTracking?: boolean;
      clickTracking?: boolean;
    }) => setDomainTracking(orgSlug, input),
    onSuccess: async (result) => {
      if (!result.ok) setError(result.error.message);
      else {
        setError(null);
        await invalidate();
      }
    },
  });

  const assign = useMutation({
    mutationFn: (input: { domainId: string; projectId: string | null }) =>
      assignDomainProject(orgSlug, input),
    onSuccess: async (result) => {
      if (!result.ok) setError(result.error.message);
      else {
        setError(null);
        await invalidate();
      }
    },
  });

  const can = data.data?.can;
  const connections = data.data?.connections ?? [];
  const projects = data.data?.projects ?? [];

  return (
    <ResourcePage
      title="Domains"
      description="Every domain across your Resend accounts: verification, DNS, tracking and receiving."
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[10rem] flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search domains…"
            className="h-9 w-full rounded-control border border-line bg-surface pr-8 pl-8 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-ink-muted"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
        {connectionNames.length > 1 ? (
          <select
            value={connection}
            onChange={(e) => setConnection(e.target.value)}
            className="h-9 rounded-control border border-line bg-surface px-2 text-xs"
            aria-label="Connection"
          >
            <option value="">All connections</option>
            {connectionNames.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        ) : null}
        <label className="inline-flex h-9 items-center gap-2 rounded-control border border-line bg-surface px-3 text-xs font-medium">
          <input
            type="checkbox"
            checked={attentionOnly}
            onChange={(e) => setAttentionOnly(e.target.checked)}
            className="size-3.5"
          />
          Needs attention{attention ? ` (${attention})` : ""}
        </label>
        {can?.create && connections.length > 0 ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent-fill px-3 text-xs font-semibold text-accent-ink"
          >
            <Plus className="size-3.5" aria-hidden /> Add domain
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      {adding ? (
        <AddDomainForm
          connections={connections}
          projects={projects}
          projectRequired={!!data.data?.projectRequired}
          busy={create.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(input) => {
            setError(null);
            create.mutate(input);
          }}
        />
      ) : null}

      {data.isPending ? (
        <ResourcePending />
      ) : data.isError ? (
        <ResourceError message="Could not load domains." />
      ) : domains.length === 0 ? (
        <ResourceEmpty>
          {connections.length === 0 ? (
            <>
              Connect a Resend account first.{" "}
              <Link
                to="/$orgSlug/settings/connections"
                params={{ orgSlug }}
                className="font-semibold text-accent-fill hover:underline"
              >
                Open Connections
              </Link>
            </>
          ) : (
            "No domains yet. Add one to send from your own address."
          )}
        </ResourceEmpty>
      ) : shown.length === 0 ? (
        <ResourceEmpty>No domains match these filters.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {shown.map((row) => {
            const status = domainStatus(row.status);
            return (
              <li key={row.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <Link
                  to="/$orgSlug/domains/$domainId"
                  params={{ orgSlug, domainId: row.id }}
                  className="min-w-0 hover:opacity-90"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        status.tone,
                      )}
                    >
                      {status.label}
                    </span>
                    {needsAttention(row) ? (
                      <span className="text-[11px] font-medium text-warning-ink">Needs attention</span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-ink-muted">
                    {row.connectionName}
                    {row.projectName ? ` · ${row.projectName}` : ""}
                    {row.receivingEnabled ? " · receiving" : ""}
                    {row.senderCount ? ` · ${row.senderCount} senders` : ""}
                  </p>
                </Link>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {can?.update ? (
                    <>
                      <label className="inline-flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={row.openTracking}
                          disabled={tracking.isPending}
                          onChange={(e) =>
                            tracking.mutate({
                              domainId: row.id,
                              openTracking: e.target.checked,
                            })
                          }
                        />
                        Opens
                      </label>
                      <label className="inline-flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={row.clickTracking}
                          disabled={tracking.isPending}
                          onChange={(e) =>
                            tracking.mutate({
                              domainId: row.id,
                              clickTracking: e.target.checked,
                            })
                          }
                        />
                        Clicks
                      </label>
                    </>
                  ) : (
                    <span className="text-ink-muted">
                      {row.openTracking ? "Opens on" : "Opens off"} ·{" "}
                      {row.clickTracking ? "Clicks on" : "Clicks off"}
                    </span>
                  )}
                  {can?.assignProject && projects.length > 0 ? (
                    <select
                      value={row.projectId ?? ""}
                      disabled={assign.isPending}
                      onChange={(e) =>
                        assign.mutate({
                          domainId: row.id,
                          projectId: e.target.value || null,
                        })
                      }
                      className="h-8 max-w-[10rem] rounded-control border border-line bg-canvas px-1.5"
                      aria-label={`Project for ${row.name}`}
                    >
                      <option value="">No project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </ResourcePage>
  );
}

function AddDomainForm({
  connections,
  projects,
  projectRequired,
  busy,
  onCancel,
  onSubmit,
}: {
  connections: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  projectRequired: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    connectionId: string;
    name: string;
    region: string;
    projectId?: string | null;
  }) => void;
}) {
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? "");
  const [name, setName] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [projectId, setProjectId] = useState(
    projectRequired ? (projects[0]?.id ?? "") : "",
  );

  return (
    <form
      className="grid max-w-lg gap-3 rounded-lg border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          connectionId,
          name: name.trim().toLowerCase(),
          region,
          projectId: projectId || null,
        });
      }}
    >
      <h2 className="text-sm font-semibold">Add domain</h2>
      {connections.length > 1 ? (
        <label className="grid gap-1 text-xs font-medium">
          Connection
          <select
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            className="h-9 rounded-control border border-line bg-canvas px-2 text-sm"
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="grid gap-1 text-xs font-medium">
        Domain name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="mail.example.com"
          className="h-9 rounded-control border border-line bg-canvas px-3 text-sm"
          autoFocus
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Region
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="h-9 rounded-control border border-line bg-canvas px-2 text-sm"
        >
          {REGIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      {projects.length > 0 ? (
        <label className="grid gap-1 text-xs font-medium">
          Project{projectRequired ? "" : " (optional)"}
          <select
            required={projectRequired}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-9 rounded-control border border-line bg-canvas px-2 text-sm"
          >
            {!projectRequired ? <option value="">No project</option> : null}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !connectionId}
          className="h-9 rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add domain"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-control border border-line px-3 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
