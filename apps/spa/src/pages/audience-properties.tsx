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
import { createProperty, deleteProperty, updateProperty } from "@/lib/actions";
import { getAudienceOptions, listProperties } from "@/lib/api";

export function AudiencePropertiesPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState("");
  const [key, setKey] = useState("");
  const [type, setType] = useState<"string" | "number">("string");
  const [fallback, setFallback] = useState("");

  const options = useQuery({
    queryKey: ["audience-options", orgSlug],
    queryFn: () => getAudienceOptions(orgSlug),
  });
  const properties = useQuery({
    queryKey: ["properties", orgSlug],
    queryFn: () => listProperties(orgSlug),
  });

  const writable = (options.data?.connections ?? []).filter((c) => c.writable);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["properties", orgSlug] });
    await queryClient.invalidateQueries({ queryKey: ["audience-options", orgSlug] });
  };

  const create = useMutation({
    mutationFn: () =>
      createProperty(orgSlug, {
        connectionId,
        key,
        type,
        fallbackValue:
          fallback === ""
            ? null
            : type === "number"
              ? Number(fallback)
              : fallback,
      }),
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
    mutationFn: () => {
      const prop = properties.data?.find((p) => p.id === editId);
      const value =
        fallback === ""
          ? null
          : prop?.type === "number"
            ? Number(fallback)
            : fallback;
      return updateProperty(orgSlug, editId!, value);
    },
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
    mutationFn: (id: string) => deleteProperty(orgSlug, id),
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
      title="Properties"
      description="Custom fields on contacts (string or number)."
    >
      <AudienceNav orgSlug={orgSlug} />
      {writable.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setEditId(null);
            setConnectionId(writable[0]!.id);
            setKey("");
            setType("string");
            setFallback("");
          }}
          className="inline-flex h-9 w-fit items-center gap-1.5 rounded-control bg-accent-fill px-3 text-xs font-semibold text-accent-ink"
        >
          <Plus className="size-3.5" aria-hidden /> New property
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
          <h2 className="text-sm font-semibold">
            {editId ? "Edit fallback" : "New property"}
          </h2>
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
          {!editId ? (
            <>
              <input
                required
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="company_name"
                pattern="[a-z][a-z0-9_]*"
                className="h-9 rounded-control border border-line bg-canvas px-3 text-sm"
                autoFocus
              />
              <select
                value={type}
                onChange={(e) => setType(e.target.value as "string" | "number")}
                className="h-9 rounded-control border border-line bg-canvas px-2 text-sm"
              >
                <option value="string">String</option>
                <option value="number">Number</option>
              </select>
            </>
          ) : null}
          <input
            value={fallback}
            onChange={(e) => setFallback(e.target.value)}
            placeholder="Fallback value (optional)"
            className="h-9 rounded-control border border-line bg-canvas px-3 text-sm"
            autoFocus={!!editId}
          />
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

      {properties.isPending ? (
        <ResourcePending />
      ) : properties.isError ? (
        <ResourceError message="Could not load properties." />
      ) : properties.data.length === 0 ? (
        <ResourceEmpty>No properties yet.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {properties.data.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.key}</p>
                <p className="text-xs text-ink-muted">
                  {row.connectionName} · {row.type}
                  {row.fallbackValue != null ? ` · fallback ${String(row.fallbackValue)}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditId(row.id);
                    setCreating(false);
                    setFallback(
                      row.fallbackValue == null ? "" : String(row.fallbackValue),
                    );
                  }}
                  className="h-8 rounded-control border border-line px-2.5 text-xs font-medium"
                >
                  Edit fallback
                </button>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete property “${row.key}”?`)) remove.mutate(row.id);
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
