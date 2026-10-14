import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { KeyRound, Link2, Plus, Trash2 } from "lucide-react";

import { timeAgo } from "@/components/connections/status";
import {
  ResourceEmpty,
} from "@/components/resource-page";
import type { ApiKeyRow, ApiKeysPagePayload } from "@/lib/api";
import { cn } from "@/lib/utils";

import { CreateApiKeyDialog } from "./create-api-key-dialog";
import { DeleteApiKeyDialog } from "./delete-api-key-dialog";

export const API_KEY_STALE_DAYS = 90;

function shortDate(iso: string | null): string {
  if (!iso) return "unknown date";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Chip({
  children,
  tone,
  title,
}: {
  children: React.ReactNode;
  tone: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone,
      )}
    >
      {children}
    </span>
  );
}

function PermissionChip({ permission }: { permission: ApiKeyRow["permission"] }) {
  if (permission === "full_access") {
    return <Chip tone="bg-warning-soft text-warning-ink">Full access</Chip>;
  }
  if (permission === "sending_access") {
    return <Chip tone="bg-info-soft text-info-ink">Sending access</Chip>;
  }
  return (
    <Chip
      tone="bg-canvas-sunken text-ink-muted"
      title="Resend doesn't tell us the permission of keys created outside Wisemail."
    >
      Permission unknown
    </Chip>
  );
}

export function ApiKeysView({
  orgSlug,
  data,
  onChanged,
}: {
  orgSlug: string;
  data: ApiKeysPagePayload;
  onChanged: () => void;
}) {
  const { keys, connections, can } = data;
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ApiKeyRow | null>(null);
  const mayCreate = can.create || can.createSending;

  const groups = useMemo(() => {
    const map = new Map<string, ApiKeyRow[]>();
    for (const key of keys) {
      map.set(key.connectionName, [...(map.get(key.connectionName) ?? []), key]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [keys]);
  const stale = keys.filter((k) => k.stale).length;

  const newButton = mayCreate ? (
    connections.length > 0 ? (
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent-fill px-3 text-xs font-semibold text-accent-ink"
      >
        <Plus aria-hidden className="size-3.5" /> New key
      </button>
    ) : (
      <Link
        to="/$orgSlug/settings/connections"
        params={{ orgSlug }}
        className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line px-3 text-xs font-semibold hover:bg-canvas-sunken"
      >
        <Link2 aria-hidden className="size-3.5" /> Connect an account
      </Link>
    )
  ) : null;

  return (
    <div className="grid gap-4">
      {keys.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {keys.length} {keys.length === 1 ? "key" : "keys"} across {groups.length}{" "}
            {groups.length === 1 ? "account" : "accounts"}
          </p>
          {newButton}
        </div>
      ) : null}

      {stale > 0 ? (
        <p role="status" className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-ink">
          {stale} full-access {stale === 1 ? "key is" : "keys are"} older than {API_KEY_STALE_DAYS}{" "}
          days. Rotate {stale === 1 ? "it" : "them"} when you can: create a new key, switch your
          apps over, then delete the old one.
        </p>
      ) : null}

      {keys.length === 0 ? (
        <div className="grid gap-3">
          <ResourceEmpty>
            {connections.length === 0
              ? "Keys come from your connected Resend accounts. Connect one and its keys show up here."
              : mayCreate
                ? "Create a sending key for an app or a project. You'll see the key once."
                : "Keys appear here once a connected Resend account has some."}
          </ResourceEmpty>
          {newButton}
        </div>
      ) : (
        <div className="grid gap-4">
          {groups.map(([connectionName, list]) => (
            <section
              key={connectionName}
              aria-labelledby={`keys-${connectionName}`}
              className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm"
            >
              <h2
                id={`keys-${connectionName}`}
                className="border-b border-line bg-canvas-sunken px-4 py-2.5 text-sm font-semibold min-[560px]:px-5"
              >
                {connectionName}
              </h2>
              <ul>
                {list.map((key) => (
                  <li
                    key={key.id}
                    data-testid="api-key-row"
                    className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0 min-[560px]:px-5"
                  >
                    <div className="grid min-w-0 gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <KeyRound aria-hidden className="size-4 shrink-0 text-ink-muted" />
                        <span className="truncate text-[0.9375rem] font-semibold">{key.name}</span>
                        <PermissionChip permission={key.permission} />
                        {key.stale ? (
                          <Chip tone="bg-warning-soft text-warning-ink">
                            Older than {API_KEY_STALE_DAYS} days
                          </Chip>
                        ) : null}
                        {key.inUse === "exact" ? (
                          <Chip tone="bg-engaged-soft text-engaged">Used by Wisemail</Chip>
                        ) : key.inUse === "possible" ? (
                          <Chip tone="bg-engaged-soft text-engaged">May be used by Wisemail</Chip>
                        ) : null}
                      </div>
                      <p className="text-[0.8125rem] text-ink-muted">
                        {key.domainName ? `Limited to ${key.domainName} · ` : ""}
                        Created {shortDate(key.createdAt)} ·{" "}
                        {key.lastUsedAt ? `used ${timeAgo(key.lastUsedAt)}` : "never used"}
                      </p>
                    </div>
                    {can.delete ? (
                      <button
                        type="button"
                        aria-label={`Delete ${key.name}`}
                        onClick={() => setDeleting(key)}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-canvas-sunken hover:text-danger-ink"
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <details className="rounded-xl border border-line bg-surface px-4 py-3 shadow-sm min-[560px]:px-5">
        <summary className="cursor-pointer text-sm font-semibold">
          How to rotate a key safely
        </summary>
        <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-sm text-ink-secondary">
          <li>Create a new key with the same permission and domain.</li>
          <li>Put it in your app or server and deploy.</li>
          <li>Check here that the old key shows “never used” or a stale time.</li>
          <li>Delete the old key.</li>
        </ol>
      </details>

      {!mayCreate && keys.length > 0 ? (
        <p className="text-sm text-ink-muted">
          Only Owners, Admins and Developers can create keys, and Developers only sending keys.
        </p>
      ) : null}

      {mayCreate && connections.length > 0 ? (
        <CreateApiKeyDialog
          orgSlug={orgSlug}
          connections={connections}
          canCreateFull={can.create}
          open={creating}
          onOpenChange={setCreating}
          onCreated={onChanged}
        />
      ) : null}
      {deleting ? (
        <DeleteApiKeyDialog
          key={deleting.id}
          orgSlug={orgSlug}
          apiKey={deleting}
          open
          onOpenChange={(next) => !next && setDeleting(null)}
          onDeleted={onChanged}
        />
      ) : null}
    </div>
  );
}
