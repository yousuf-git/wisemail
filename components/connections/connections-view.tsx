"use client";

import { Plug } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { LiveRefresh } from "@/components/app/live-refresh";
import { topics } from "@/lib/realtime/topics";
import type { ConnectionDTO, ConnectionQuota } from "@/lib/dto/connection";
import { AddConnectionDialog } from "./add-connection-dialog";
import { ConnectionCard } from "./connection-card";

export type ConnectionPermissions = {
  create: boolean;
  update: boolean;
  delete: boolean;
  /** domain:update, for the tracking fixes on the checklist. */
  domainUpdate: boolean;
};

export function ConnectionsView({
  orgSlug,
  connections,
  quota,
  can,
}: {
  orgSlug: string;
  connections: ConnectionDTO[];
  quota: ConnectionQuota;
  can: ConnectionPermissions;
}) {
  const atLimit = quota.used >= quota.limit;
  const addButton = can.create ? (
    <AddConnectionDialog orgSlug={orgSlug} quota={quota} atLimit={atLimit} />
  ) : null;

  return (
    <div className="grid gap-4">
      <LiveRefresh topics={[topics.connections()]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted" data-testid="connection-quota">
          {quota.used} of {quota.limit} Resend {quota.limit === 1 ? "account" : "accounts"} on{" "}
          {quota.planLabel}
        </p>
        {connections.length > 0 ? addButton : null}
      </div>

      {connections.length === 0 ? (
        <EmptyState title="Connect your first Resend account" mood="idle" action={addButton}>
          {can.create
            ? "Paste a Full access API key and Wisemail registers its own webhook, then syncs your domains and emails."
            : "Only Owners and Admins can connect a Resend account. Ask one of them to add it."}
        </EmptyState>
      ) : (
        <ul className="grid gap-3" aria-label="Connections">
          {connections.map((connection) => (
            <li key={connection.id}>
              <ConnectionCard orgSlug={orgSlug} connection={connection} can={can} />
            </li>
          ))}
        </ul>
      )}

      {!can.create && connections.length > 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Plug aria-hidden className="size-4" />
          Only Owners and Admins can add, rename or remove connections.
        </p>
      ) : null}
    </div>
  );
}
