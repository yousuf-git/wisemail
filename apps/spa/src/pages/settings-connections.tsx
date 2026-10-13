import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { addConnection, retryConnection, syncConnection } from "@/lib/actions";
import { listConnections } from "@/lib/api";

export function SettingsConnectionsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/connections" });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const connections = useQuery({
    queryKey: ["connections", orgSlug],
    queryFn: () => listConnections(orgSlug),
  });

  const create = useMutation({
    mutationFn: () => addConnection(orgSlug, { name: name.trim(), apiKey: apiKey.trim() }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setName("");
      setApiKey("");
      await queryClient.invalidateQueries({ queryKey: ["connections", orgSlug] });
    },
    onError: () => setError("Could not add the connection."),
  });

  const run = useMutation({
    mutationFn: async ({ id, kind }: { id: string; kind: "sync" | "retry" }) => {
      setBusyId(id);
      return kind === "sync" ? syncConnection(orgSlug, id) : retryConnection(orgSlug, id);
    },
    onSuccess: async (result) => {
      setBusyId(null);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["connections", orgSlug] });
    },
    onError: () => {
      setBusyId(null);
      setError("Could not update the connection.");
    },
  });

  return (
    <ResourcePage title="Connections" description="Add · sync · retry">
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      <form
        className="grid gap-2 rounded-lg border border-line bg-surface p-4 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-ink-muted">Name</span>
          <input
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 rounded-control border border-line bg-canvas px-3 text-sm"
            placeholder="Production"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-ink-muted">Resend API key</span>
          <input
            required
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="h-9 rounded-control border border-line bg-canvas px-3 font-mono text-sm"
            placeholder="re_…"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={create.isPending || name.trim().length < 2 || !apiKey.trim()}
            className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-50"
          >
            {create.isPending ? "Adding…" : "Add"}
          </button>
        </div>
      </form>

      {connections.isPending ? (
        <ResourcePending />
      ) : connections.isError ? (
        <ResourceError message="Could not load connections." />
      ) : connections.data.length === 0 ? (
        <ResourceEmpty>No Resend connections yet.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {connections.data.map((row) => {
            const busy = busyId === row.id && run.isPending;
            const needsAttention = row.status === "needs_attention";
            return (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
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
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs font-medium text-ink-secondary">{row.status}</span>
                  {needsAttention ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run.mutate({ id: row.id, kind: "retry" })}
                      className="rounded-control border border-line px-2.5 py-1 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
                    >
                      Retry
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run.mutate({ id: row.id, kind: "sync" })}
                      className="rounded-control border border-line px-2.5 py-1 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
                    >
                      Sync
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </ResourcePage>
  );
}
