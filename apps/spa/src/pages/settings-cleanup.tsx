import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { createCleanupRule, removeCleanupRule, setCleanupRuleEnabled } from "@/lib/actions";
import { ApiError, listCleanupRules, type CleanupRule } from "@/lib/api";

const ACTION_LABEL = { archive: "Archive", trash: "Move to Trash", delete: "Delete permanently" };

function describeRule(rule: CleanupRule): string {
  const m = rule.match;
  const parts: string[] = [];
  if (m.fromAddress) parts.push(`from ${m.fromAddress}`);
  if (m.fromDomain) parts.push(`from @${m.fromDomain}`);
  if (m.subjectContains) parts.push(`subject contains “${m.subjectContains}”`);
  if (m.direction) parts.push(m.direction === "inbound" ? "received" : "sent");
  if (m.olderThanDays) parts.push(`older than ${m.olderThanDays} days`);
  return parts.join(" · ") || "Everything";
}

/** Settings → Cleanup: list, toggle, delete, and a simple create form. */
export function SettingsCleanupPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/cleanup" });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [fromDomain, setFromDomain] = useState("");
  const [olderThanDays, setOlderThanDays] = useState("30");
  const [action, setAction] = useState<"archive" | "trash" | "delete">("trash");

  const rules = useQuery({
    queryKey: ["cleanup-rules", orgSlug],
    queryFn: () => listCleanupRules(orgSlug),
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["cleanup-rules", orgSlug] });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setCleanupRuleEnabled(orgSlug, id, enabled),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeCleanupRule(orgSlug, id),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await invalidate();
    },
  });

  const create = useMutation({
    mutationFn: () =>
      createCleanupRule(orgSlug, {
        name: name.trim(),
        kind: "rule",
        action,
        match: {
          ...(fromDomain.trim() ? { fromDomain: fromDomain.trim() } : {}),
          ...(Number(olderThanDays) > 0 ? { olderThanDays: Number(olderThanDays) } : {}),
        },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setName("");
      setFromDomain("");
      await invalidate();
    },
  });

  if (rules.isError && rules.error instanceof ApiError && rules.error.status === 403) {
    return (
      <ResourcePage title="Cleanup" description="Archive or trash old mail automatically.">
        <ResourceEmpty>Cleanup rules are for Owners, Admins and Developers.</ResourceEmpty>
      </ResourcePage>
    );
  }

  return (
    <ResourcePage
      title="Cleanup"
      description="Keep your mailbox tidy: archive or trash old mail automatically. Trash is emptied after 30 days."
    >
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      <form
        className="grid gap-2 rounded-lg border border-line bg-surface p-4 sm:grid-cols-[1fr_1fr_auto_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-ink-muted">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 rounded-control border border-line bg-canvas px-3 text-sm"
            placeholder="Old GitHub noise"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-ink-muted">From domain</span>
          <input
            value={fromDomain}
            onChange={(e) => setFromDomain(e.target.value)}
            className="h-9 rounded-control border border-line bg-canvas px-3 text-sm"
            placeholder="github.com"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-ink-muted">Older than (days)</span>
          <input
            type="number"
            min={1}
            value={olderThanDays}
            onChange={(e) => setOlderThanDays(e.target.value)}
            className="h-9 w-24 rounded-control border border-line bg-canvas px-3 text-sm"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-ink-muted">Action</span>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as typeof action)}
            className="h-9 rounded-control border border-line bg-canvas px-2 text-sm"
          >
            <option value="trash">Trash</option>
            <option value="archive">Archive</option>
            <option value="delete">Delete</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={create.isPending || name.trim().length < 2}
            className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-50"
          >
            {create.isPending ? "Adding…" : "Add rule"}
          </button>
        </div>
      </form>

      {rules.isPending ? (
        <ResourcePending />
      ) : rules.isError ? (
        <ResourceError message="Could not load cleanup rules." />
      ) : rules.data.rules.length === 0 ? (
        <ResourceEmpty>No cleanup rules yet.</ResourceEmpty>
      ) : (
        <ul className="grid gap-2" aria-label="Cleanup rules">
          {rules.data.rules.map((rule) => {
            const locked = rule.action === "delete" && !rules.data.canDelete;
            return (
              <li
                key={rule.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{rule.name}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {ACTION_LABEL[rule.action]} · {describeRule(rule)}
                    {rule.lastRunAt
                      ? ` · last run ${new Date(rule.lastRunAt).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      disabled={locked || toggle.isPending}
                      onChange={(e) =>
                        toggle.mutate({ id: rule.id, enabled: e.target.checked })
                      }
                    />
                    On
                  </label>
                  {rules.data.canDelete || rule.action !== "delete" ? (
                    <button
                      type="button"
                      disabled={remove.isPending}
                      className="rounded-control border border-line px-2.5 py-1 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete the rule “${rule.name}”? Mail it already moved stays where it is.`,
                          )
                        ) {
                          remove.mutate(rule.id);
                        }
                      }}
                    >
                      Delete
                    </button>
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
