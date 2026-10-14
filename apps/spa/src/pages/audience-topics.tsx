import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";

import { AudienceNav } from "@/components/audience/audience-nav";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { createTopic, deleteTopic, updateTopic } from "@/lib/actions";
import { getAudienceOptions, listTopics } from "@/lib/api";

export function AudienceTopicsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultSubscription, setDefaultSubscription] = useState<"opt_in" | "opt_out">(
    "opt_in",
  );

  const options = useQuery({
    queryKey: ["audience-options", orgSlug],
    queryFn: () => getAudienceOptions(orgSlug),
  });
  const topics = useQuery({
    queryKey: ["topics", orgSlug],
    queryFn: () => listTopics(orgSlug),
  });

  const writable = (options.data?.connections ?? []).filter((c) => c.writable);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["topics", orgSlug] });
    await queryClient.invalidateQueries({ queryKey: ["audience-options", orgSlug] });
  };

  const create = useMutation({
    mutationFn: () =>
      createTopic(orgSlug, { connectionId, name, description, defaultSubscription }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setCreating(false);
      await invalidate();
    },
  });

  const update = useMutation({
    mutationFn: () => updateTopic(orgSlug, { id: editId!, name, description }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setEditId(null);
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTopic(orgSlug, id),
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
      title="Topics"
      description="Subscription preferences contacts can opt into or out of."
    >
      <AudienceNav orgSlug={orgSlug} />
      {writable.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setEditId(null);
            setConnectionId(writable[0]!.id);
            setName("");
            setDescription("");
            setDefaultSubscription("opt_in");
          }}
          className="inline-flex h-9 w-fit items-center gap-1.5 rounded-control bg-accent-fill px-3 text-xs font-semibold text-accent-ink"
        >
          <Plus className="size-3.5" aria-hidden /> New topic
        </button>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      {creating || editId ? (
        <form
          className="grid max-w-md gap-3 rounded-lg border border-line bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (editId) update.mutate();
            else create.mutate();
          }}
        >
          <h2 className="text-sm font-semibold">{editId ? "Edit topic" : "New topic"}</h2>
          {!editId && writable.length > 1 ? (
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
            placeholder="Product updates"
            className="h-9 rounded-control border border-line bg-canvas px-3 text-sm"
            autoFocus
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            placeholder="Optional description"
            className="min-h-20 rounded-control border border-line bg-canvas px-3 py-2 text-sm"
          />
          {!editId ? (
            <select
              value={defaultSubscription}
              onChange={(e) =>
                setDefaultSubscription(e.target.value as "opt_in" | "opt_out")
              }
              className="h-9 rounded-control border border-line bg-canvas px-2 text-sm"
            >
              <option value="opt_in">Default: opt in</option>
              <option value="opt_out">Default: opt out</option>
            </select>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={create.isPending || update.isPending}
              className="h-9 rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setEditId(null);
              }}
              className="h-9 rounded-control border border-line px-3 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {topics.isPending ? (
        <ResourcePending />
      ) : topics.isError ? (
        <ResourceError message="Could not load topics." />
      ) : topics.data.length === 0 ? (
        <ResourceEmpty>No topics yet.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {topics.data.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="text-xs text-ink-muted">
                  {row.connectionName} · default {row.defaultSubscription.replace("_", " ")}
                  {row.description ? ` · ${row.description}` : null}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditId(row.id);
                    setCreating(false);
                    setName(row.name);
                    setDescription(row.description);
                  }}
                  className="h-8 rounded-control border border-line px-2.5 text-xs font-medium"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete topic “${row.name}”?`)) remove.mutate(row.id);
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
