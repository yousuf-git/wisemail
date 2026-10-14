import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Ban, Eraser, Plus } from "lucide-react";
import { useState } from "react";

import { RuleDialog } from "@/components/cleanup/rule-dialog";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { removeCleanupRule, setCleanupRuleEnabled } from "@/lib/actions";
import {
  ApiError,
  listCleanupRules,
  listConnections,
  type CleanupRule,
} from "@/lib/api";

const ACTION_LABEL = { archive: "Archive", trash: "Move to Trash", delete: "Delete permanently" };

function describeRule(rule: CleanupRule): string {
  const m = rule.match;
  const parts: string[] = [];
  if (m.fromAddress) parts.push(`from ${m.fromAddress}`);
  if (m.fromDomain) parts.push(`from @${m.fromDomain}`);
  if (m.subjectContains) parts.push(`subject contains “${m.subjectContains}”`);
  if (m.direction) parts.push(m.direction === "inbound" ? "received" : "sent");
  if (m.tag) parts.push(`tag ${m.tag.name}${m.tag.value ? `=${m.tag.value}` : ""}`);
  if (m.aiCategory) parts.push(`AI category ${m.aiCategory}`);
  if (m.olderThanDays) parts.push(`older than ${m.olderThanDays} days`);
  if (rule.scope?.mailboxAddresses?.length)
    parts.push(`in ${rule.scope.mailboxAddresses.join(", ")}`);
  return parts.join(" · ") || "Everything";
}

export function SettingsCleanupPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/cleanup" });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CleanupRule | "new" | null>(null);

  const rules = useQuery({
    queryKey: ["cleanup-rules", orgSlug],
    queryFn: () => listCleanupRules(orgSlug),
    retry: false,
  });

  const connections = useQuery({
    queryKey: ["connections", orgSlug],
    queryFn: () => listConnections(orgSlug),
    enabled: !!rules.data,
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

  if (rules.isError && rules.error instanceof ApiError && rules.error.status === 403) {
    return (
      <ResourcePage title="Cleanup" description="Archive or trash old mail automatically.">
        <ResourceEmpty>Cleanup rules are for Owners, Admins and Developers.</ResourceEmpty>
      </ResourcePage>
    );
  }

  const canDelete = rules.data?.canDelete ?? false;
  const connectionOptions =
    connections.data?.connections.map((c) => ({ id: c.id, name: c.name })) ?? [];

  return (
    <ResourcePage
      title="Cleanup"
      description="Keep your mailbox tidy: archive or trash old mail automatically, and send mail from senders you never want to Trash. Trash is emptied after 30 days."
    >
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          Rules run every hour. Blocked senders skip the inbox on arrival.
        </p>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover"
        >
          <Plus aria-hidden className="size-4" /> New rule
        </button>
      </div>

      {rules.isPending ? (
        <ResourcePending />
      ) : rules.isError ? (
        <ResourceError message="Could not load cleanup rules." />
      ) : rules.data.rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-5 py-8 text-center">
          <p className="text-base font-semibold">No cleanup rules yet</p>
          <p className="mt-2 text-sm text-ink-muted">
            For example: move notifications from github.com to Trash after 30 days, or send mail
            from a sender you never want straight to Trash.
          </p>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="mt-4 inline-flex h-9 items-center rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover"
          >
            Create your first rule
          </button>
        </div>
      ) : (
        <ul className="grid gap-2" aria-label="Cleanup rules">
          {rules.data.rules.map((rule) => {
            const locked = rule.action === "delete" && !canDelete;
            return (
              <li
                key={rule.id}
                data-testid="cleanup-rule"
                className="grid gap-3 rounded-xl bg-surface p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              >
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {rule.kind === "block_sender" ? (
                      <Ban aria-hidden className="size-3.5 text-ink-muted" />
                    ) : (
                      <Eraser aria-hidden className="size-3.5 text-ink-muted" />
                    )}
                    <p className="truncate text-sm font-semibold">{rule.name}</p>
                    {!rule.enabled ? (
                      <span className="rounded-full bg-canvas-sunken px-2 py-0.5 text-[0.7rem] font-semibold text-ink-muted">
                        Off
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-ink-muted">
                    {ACTION_LABEL[rule.action]} · {describeRule(rule)}
                    {rule.lastRunAt
                      ? ` · last run ${new Date(rule.lastRunAt).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={rule.enabled}
                      disabled={locked || toggle.isPending}
                      onChange={(e) =>
                        toggle.mutate({ id: rule.id, enabled: e.target.checked })
                      }
                      className="size-4 accent-accent"
                    />
                    On
                  </label>
                  <button
                    type="button"
                    className="rounded-control border border-line px-2.5 py-1 text-xs font-medium hover:bg-canvas-sunken"
                    onClick={() => setEditing(rule)}
                  >
                    Edit
                  </button>
                  {canDelete || rule.action !== "delete" ? (
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

      <RuleDialog
        orgSlug={orgSlug}
        rule={editing && editing !== "new" ? editing : undefined}
        connections={connectionOptions}
        canDelete={canDelete}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={() => {
          setEditing(null);
          void invalidate();
        }}
      />
    </ResourcePage>
  );
}
