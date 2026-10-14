import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Check, CircleAlert, KeyRound, Radio } from "lucide-react";
import { useState } from "react";

import { Checklist } from "@/components/connections/checklist";
import {
  CONNECTION_STATUS,
  STATUS_REASON_COPY,
  summarizeChecklist,
  timeAgo,
} from "@/components/connections/status";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import {
  addConnection,
  removeConnection,
  renameConnection,
  retryConnection,
  syncConnection,
} from "@/lib/actions";
import type { ConnectionRow } from "@/lib/api";
import { listConnections } from "@/lib/api";
import { cn } from "@/lib/utils";

export function SettingsConnectionsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/connections" });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [confirmExtra, setConfirmExtra] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const page = useQuery({
    queryKey: ["connections", orgSlug],
    queryFn: () => listConnections(orgSlug),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["connections", orgSlug] });

  const create = useMutation({
    mutationFn: () =>
      addConnection(orgSlug, {
        name: name.trim(),
        apiKey: apiKey.trim(),
        confirmExtraCost: confirmExtra || undefined,
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setName("");
      setApiKey("");
      setConfirmExtra(false);
      await invalidate();
    },
    onError: () => setError("Could not add the connection."),
  });

  const run = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: "sync" | "retry" }) =>
      kind === "sync" ? syncConnection(orgSlug, id) : retryConnection(orgSlug, id),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await invalidate();
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      renameConnection(orgSlug, id, next),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setRenamingId(null);
      setError(null);
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: ({ id, confirmName }: { id: string; confirmName: string }) =>
      removeConnection(orgSlug, id, confirmName),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await invalidate();
    },
  });

  const quota = page.data?.quota;
  const can = page.data?.can;
  const atLimit = !!quota && quota.used >= quota.limit && !quota.extraUnitUsd;
  const needsExtraConfirm = !!quota && quota.used >= quota.limit && !!quota.extraUnitUsd;

  return (
    <ResourcePage
      title="Connections"
      description="Each connection is one Resend account. Wisemail listens to its events and keeps its data in sync."
    >
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      {quota ? (
        <p className="text-sm text-ink-muted" data-testid="connection-quota">
          {quota.used} of {quota.limit} Resend {quota.limit === 1 ? "account" : "accounts"} on{" "}
          {quota.planLabel}
          {needsExtraConfirm && quota.extraUnitUsd != null
            ? ` · extra accounts +$${quota.extraUnitUsd}/mo`
            : ""}
        </p>
      ) : null}

      {can?.create && !atLimit ? (
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
          <div className="flex flex-col items-stretch justify-end gap-2">
            {needsExtraConfirm ? (
              <label className="flex items-center gap-2 text-xs text-ink-secondary">
                <input
                  type="checkbox"
                  checked={confirmExtra}
                  onChange={(e) => setConfirmExtra(e.target.checked)}
                />
                Confirm extra cost
              </label>
            ) : null}
            <button
              type="submit"
              data-tour="connections-add"
              disabled={
                create.isPending ||
                name.trim().length < 2 ||
                !apiKey.trim() ||
                (needsExtraConfirm && !confirmExtra)
              }
              className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-50"
            >
              {create.isPending ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      ) : null}

      {can && !can.create ? (
        <p className="text-sm text-ink-muted">
          Only Owners and Admins can add, rename or remove connections.
        </p>
      ) : null}

      {atLimit && can?.create ? (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-ink">
          You&apos;ve used every connection on {quota?.planLabel}. Upgrade to add another.
        </p>
      ) : null}

      {page.isPending ? (
        <ResourcePending />
      ) : page.isError ? (
        <ResourceError message="Could not load connections." />
      ) : page.data.connections.length === 0 ? (
        <ResourceEmpty>
          {can?.create
            ? "Paste a Full access API key above and Wisemail registers its webhook, then syncs domains and emails."
            : "No Resend connections yet. Ask an Owner or Admin to add one."}
        </ResourceEmpty>
      ) : (
        <ul className="grid gap-3" aria-label="Connections">
          {page.data.connections.map((connection) => (
            <ConnectionCard
              key={connection.id}
              orgSlug={orgSlug}
              connection={connection}
              can={page.data.can}
              busy={run.isPending || rename.isPending || remove.isPending}
              renaming={renamingId === connection.id}
              renameValue={renameValue}
              onRenameStart={() => {
                setRenamingId(connection.id);
                setRenameValue(connection.name);
              }}
              onRenameCancel={() => setRenamingId(null)}
              onRenameChange={setRenameValue}
              onRenameSave={() =>
                rename.mutate({ id: connection.id, next: renameValue.trim() })
              }
              onRetry={() => run.mutate({ id: connection.id, kind: "retry" })}
              onSync={() => run.mutate({ id: connection.id, kind: "sync" })}
              onRemove={() => {
                if (
                  window.confirm(
                    `Remove “${connection.name}”? Type confirmation continues. Wisemail deletes its webhook; synced data stays.`,
                  )
                ) {
                  remove.mutate({ id: connection.id, confirmName: connection.name });
                }
              }}
            />
          ))}
        </ul>
      )}
    </ResourcePage>
  );
}

function ConnectionCard({
  orgSlug,
  connection,
  can,
  busy,
  renaming,
  renameValue,
  onRenameStart,
  onRenameCancel,
  onRenameChange,
  onRenameSave,
  onRetry,
  onSync,
  onRemove,
}: {
  orgSlug: string;
  connection: ConnectionRow;
  can: { create: boolean; update: boolean; delete: boolean; domainUpdate: boolean };
  busy: boolean;
  renaming: boolean;
  renameValue: string;
  onRenameStart: () => void;
  onRenameCancel: () => void;
  onRenameChange: (v: string) => void;
  onRenameSave: () => void;
  onRetry: () => void;
  onSync: () => void;
  onRemove: () => void;
}) {
  const [checklistOpen, setChecklistOpen] = useState(false);
  const status = CONNECTION_STATUS[connection.status] ?? {
    label: connection.status,
    state: "neutral" as const,
  };
  const reason = connection.statusReason
    ? STATUS_REASON_COPY[connection.statusReason] ?? connection.statusReason
    : null;
  const canRetry =
    can.update && connection.status === "needs_attention" && !connection.webhookRegistered;
  const summary = connection.checklist ? summarizeChecklist(connection.checklist) : null;
  const manageable = connection.status !== "read_only" && connection.status !== "disabled";

  return (
    <li>
      <article
        id={`connection-${connection.id}`}
        aria-label={connection.name}
        className="grid gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm min-[560px]:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            {renaming ? (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (renameValue.trim().length >= 2) onRenameSave();
                }}
              >
                <input
                  value={renameValue}
                  onChange={(e) => onRenameChange(e.target.value)}
                  className="h-9 rounded-control border border-line bg-canvas px-3 text-sm"
                  autoFocus
                />
                <button
                  type="submit"
                  className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={onRenameCancel}
                  className="h-9 rounded-control border border-line px-3 text-sm"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight">
                {connection.name}
              </h2>
            )}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
                status.state === "success" && "bg-success-soft text-success-ink",
                status.state === "warning" && "bg-warning-soft text-warning-ink",
                status.state === "danger" && "bg-danger-soft text-danger-ink",
                status.state === "info" && "bg-info-soft text-info-ink",
                status.state === "neutral" && "bg-canvas-sunken text-ink-muted",
              )}
            >
              {status.label}
            </span>
            <Link
              to="/$orgSlug/settings/connections/$connectionId"
              params={{ orgSlug, connectionId: connection.id }}
              className="text-[0.8125rem] font-medium text-ink-secondary underline-offset-4 hover:text-ink hover:underline"
            >
              Details
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {canRetry ? (
              <button
                type="button"
                disabled={busy}
                onClick={onRetry}
                className="h-8 rounded-control border border-line px-2.5 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
              >
                Retry
              </button>
            ) : can.update && connection.status !== "disabled" ? (
              <button
                type="button"
                disabled={busy}
                onClick={onSync}
                className="h-8 rounded-control border border-line px-2.5 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
              >
                Sync
              </button>
            ) : null}
            {can.update ? (
              <button
                type="button"
                disabled={busy || renaming}
                onClick={onRenameStart}
                className="h-8 rounded-control border border-line px-2.5 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
              >
                Rename
              </button>
            ) : null}
            {can.delete ? (
              <button
                type="button"
                disabled={busy}
                onClick={onRemove}
                className="h-8 rounded-control border border-line px-2.5 text-xs font-medium text-danger-ink hover:bg-danger-soft disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-[0.8125rem] text-ink-secondary min-[640px]:grid-cols-3">
          <div className="flex items-center gap-2">
            <KeyRound aria-hidden className="size-4 text-ink-muted" />
            <dd>
              <code className="rounded-sm bg-canvas-sunken px-1.5 py-0.5 font-mono text-xs">
                re_••••{connection.apiKeyLast4 ?? "••••"}
              </code>
            </dd>
          </div>
          <div className="flex items-center gap-2">
            {connection.webhookRegistered ? (
              <Check aria-hidden className="size-4 text-success" />
            ) : (
              <CircleAlert aria-hidden className="size-4 text-warning" />
            )}
            <dd>
              {connection.webhookRegistered ? "Webhook registered" : "Webhook not registered"}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <Radio aria-hidden className="size-4 text-ink-muted" />
            <dd>
              {connection.lastEventAt
                ? `Last event ${timeAgo(connection.lastEventAt)}`
                : "No events yet"}
            </dd>
          </div>
        </dl>

        {reason ? (
          <p
            role="status"
            className="rounded-md bg-warning-soft px-3 py-2.5 text-[0.8125rem] leading-snug text-warning-ink"
          >
            {reason}
          </p>
        ) : null}

        {connection.sync ? (
          <p className="text-xs text-ink-muted">
            Sync {connection.sync.state}
            {connection.sync.stage ? ` · ${connection.sync.stage.label}` : ""}
            {connection.lastSyncAt ? ` · ${timeAgo(connection.lastSyncAt)}` : ""}
          </p>
        ) : connection.lastSyncAt ? (
          <p className="text-xs text-ink-muted">Last sync {timeAgo(connection.lastSyncAt)}</p>
        ) : null}

        {connection.checklist && connection.checklist.length > 0 ? (
          <div className="grid gap-2">
            <button
              type="button"
              className="justify-self-start text-sm font-medium text-accent-fill hover:underline"
              onClick={() => setChecklistOpen((v) => !v)}
            >
              Setup checklist
              {summary ? ` · ${summary.ok}/${summary.total} ready` : ""}
              {checklistOpen ? " ▾" : " ▸"}
            </button>
            {checklistOpen ? (
              <Checklist
                orgSlug={orgSlug}
                connectionId={connection.id}
                items={connection.checklist}
                can={{ connection: can.update, domain: can.domainUpdate }}
                fixesDisabled={!manageable}
              />
            ) : null}
          </div>
        ) : null}
      </article>
    </li>
  );
}
