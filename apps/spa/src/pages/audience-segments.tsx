import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";

import { AudienceNav } from "@/components/audience/audience-nav";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { createSegment, deleteSegment, renameSegment } from "@/lib/actions";
import { getAudienceOptions, listSegments } from "@/lib/api";

export function AudienceSegmentsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [connectionId, setConnectionId] = useState("");

  const options = useQuery({
    queryKey: ["audience-options", orgSlug],
    queryFn: () => getAudienceOptions(orgSlug),
  });
  const segments = useQuery({
    queryKey: ["segments", orgSlug],
    queryFn: () => listSegments(orgSlug),
  });

  const writable = (options.data?.connections ?? []).filter((c) => c.writable);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["segments", orgSlug] });
    await queryClient.invalidateQueries({ queryKey: ["audience-options", orgSlug] });
  };

  const create = useMutation({
    mutationFn: () => createSegment(orgSlug, { connectionId, name }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setCreating(false);
      setName("");
      await invalidate();
    },
  });

  const rename = useMutation({
    mutationFn: () => renameSegment(orgSlug, renameId!, name),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setRenameId(null);
      setName("");
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSegment(orgSlug, id),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await invalidate();
    },
  });

  return (
    <ResourcePage
      title="Segments"
      description="Groups of contacts you can send a broadcast to."
    >
      <AudienceNav orgSlug={orgSlug} />
      {writable.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setConnectionId(writable[0]!.id);
            setName("");
          }}
          className="inline-flex h-9 w-fit items-center gap-1.5 rounded-control bg-accent-fill px-3 text-xs font-semibold text-accent-ink"
        >
          <Plus className="size-3.5" aria-hidden /> New segment
        </button>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      {creating || renameId ? (
        <form
          className="grid max-w-md gap-3 rounded-lg border border-line bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (renameId) rename.mutate();
            else create.mutate();
          }}
        >
          <h2 className="text-sm font-semibold">{renameId ? "Rename segment" : "New segment"}</h2>
          {!renameId && writable.length > 1 ? (
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="h-9 rounded-control border border-line bg-canvas px-2 text-sm"
            >
              {writable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : null}
          <input
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Newsletter subscribers"
            className="h-9 rounded-control border border-line bg-canvas px-3 text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={create.isPending || rename.isPending}
              className="h-9 rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setRenameId(null);
              }}
              className="h-9 rounded-control border border-line px-3 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {segments.isPending ? (
        <ResourcePending />
      ) : segments.isError ? (
        <ResourceError message="Could not load segments." />
      ) : segments.data.length === 0 ? (
        <ResourceEmpty>No segments yet.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {segments.data.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="text-xs text-ink-muted">
                  {row.connectionName} · {row.contactCount} contacts
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/$orgSlug/audience/contacts"
                  params={{ orgSlug }}
                  className="text-xs font-medium text-accent-fill hover:underline"
                >
                  View contacts
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setRenameId(row.id);
                    setName(row.name);
                    setCreating(false);
                  }}
                  className="h-8 rounded-control border border-line px-2.5 text-xs font-medium"
                >
                  Rename
                </button>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete segment “${row.name}”?`)) remove.mutate(row.id);
                  }}
                  className="h-8 rounded-control border border-line px-2.5 text-xs font-medium text-danger-ink hover:bg-danger-soft"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ResourcePage>
  );
}
