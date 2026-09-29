"use client";

import { KeyRound, Link2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { StatusChip } from "@/components/app/status-chip";
import { shortDate } from "@/components/domains/domain-status";
import { timeAgo } from "@/components/connections/status";
import { Button } from "@/components/ui/button";
import type { ApiKeyDTO } from "@/lib/dto/domain";
import { API_KEY_STALE_DAYS } from "@/lib/validation/domain";
import { CreateApiKeyDialog, type KeyConnectionOption } from "./create-api-key-dialog";
import { DeleteApiKeyDialog } from "./delete-api-key-dialog";

export type ApiKeyPermissions = { create: boolean; createSending: boolean; delete: boolean };

function PermissionChip({ permission }: { permission: ApiKeyDTO["permission"] }) {
  if (permission === "full_access") return <StatusChip state="warning">Full access</StatusChip>;
  if (permission === "sending_access") return <StatusChip state="info">Sending access</StatusChip>;
  return (
    <span title="Resend doesn't tell us the permission of keys created outside Wisemail.">
      <StatusChip state="neutral">Permission unknown</StatusChip>
    </span>
  );
}

export function ApiKeysView({
  orgSlug,
  keys,
  connections,
  can,
}: {
  orgSlug: string;
  keys: ApiKeyDTO[];
  connections: KeyConnectionOption[];
  can: ApiKeyPermissions;
}) {
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ApiKeyDTO | null>(null);
  const mayCreate = can.create || can.createSending;

  const groups = useMemo(() => {
    const map = new Map<string, ApiKeyDTO[]>();
    for (const key of keys)
      map.set(key.connectionName, [...(map.get(key.connectionName) ?? []), key]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [keys]);
  const stale = keys.filter((k) => k.stale).length;

  const newButton = mayCreate ? (
    connections.length > 0 ? (
      <Button className="font-bold" onClick={() => setCreating(true)}>
        <Plus aria-hidden /> New key
      </Button>
    ) : (
      <Button asChild variant="outline">
        <Link href={`/${orgSlug}/settings/connections`}>
          <Link2 aria-hidden /> Connect an account
        </Link>
      </Button>
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
        <EmptyState title="No API keys to show" mood="idle" action={newButton}>
          {connections.length === 0
            ? "Keys come from your connected Resend accounts. Connect one and its keys show up here."
            : mayCreate
              ? "Create a sending key for an app or a project. You'll see the key once."
              : "Keys appear here once a connected Resend account has some."}
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {groups.map(([connectionName, list]) => (
            <section
              key={connectionName}
              aria-labelledby={`keys-${connectionName}`}
              className="overflow-hidden rounded-xl bg-surface shadow-md"
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
                          <StatusChip state="warning">
                            Older than {API_KEY_STALE_DAYS} days
                          </StatusChip>
                        ) : null}
                        {key.inUse === "exact" ? (
                          <StatusChip state="engaged">Used by Wisemail</StatusChip>
                        ) : key.inUse === "possible" ? (
                          <StatusChip state="engaged">May be used by Wisemail</StatusChip>
                        ) : null}
                      </div>
                      <p className="text-[0.8125rem] text-ink-muted" suppressHydrationWarning>
                        {key.domainName ? `Limited to ${key.domainName} · ` : ""}
                        Created {shortDate(key.createdAt)} ·{" "}
                        {key.lastUsedAt ? `used ${timeAgo(key.lastUsedAt)}` : "never used"}
                      </p>
                    </div>
                    {can.delete ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${key.name}`}
                        onClick={() => setDeleting(key)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <details className="rounded-xl bg-surface px-4 py-3 shadow-md min-[560px]:px-5">
        <summary className="cursor-pointer text-sm font-semibold">
          How to rotate a key safely
        </summary>
        <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-sm text-ink-secondary">
          <li>Create a new key with the same permission and domain.</li>
          <li>Put it in your app or server and deploy.</li>
          <li>Check here that the old key shows &ldquo;never used&rdquo; or a stale time.</li>
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
        />
      ) : null}
      {deleting ? (
        <DeleteApiKeyDialog
          key={deleting.id}
          orgSlug={orgSlug}
          apiKey={deleting}
          open
          onOpenChange={(open) => !open && setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
