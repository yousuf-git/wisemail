"use client";

import { Check, CircleAlert, KeyRound, MoreHorizontal, Radio, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { retryConnectionAction } from "@/app/(app)/[orgSlug]/settings/connections/actions";
import { StatusChip } from "@/components/app/status-chip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_REASON_COPY, type ConnectionDTO } from "@/lib/dto/connection";
import type { ConnectionPermissions } from "./connections-view";
import { RemoveConnectionDialog } from "./remove-connection-dialog";
import { RenameConnectionDialog } from "./rename-connection-dialog";
import { CONNECTION_STATUS, timeAgo } from "./status";

export function ConnectionCard({
  orgSlug,
  connection,
  can,
}: {
  orgSlug: string;
  connection: ConnectionDTO;
  can: ConnectionPermissions;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [retrying, startRetry] = useTransition();
  const status = CONNECTION_STATUS[connection.status];
  const reason = connection.statusReason ? STATUS_REASON_COPY[connection.statusReason] : null;
  const canRetry =
    can.update && connection.status === "needs_attention" && !connection.webhookRegistered;
  const hasMenu = can.update || can.delete;

  function retry() {
    startRetry(async () => {
      const result = await retryConnectionAction(orgSlug, { connectionId: connection.id });
      if (!result.ok) toast.error(result.error.message);
      else if (result.data.status === "active") toast.success(`“${connection.name}” is connected`);
      else toast.warning("Still needs attention");
      router.refresh();
    });
  }

  return (
    <article
      id={`connection-${connection.id}`}
      aria-label={connection.name}
      className="grid gap-3 rounded-xl bg-surface p-4 shadow-md min-[560px]:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="min-w-0 truncate text-lg leading-7 font-semibold tracking-[-0.01em]">
            {connection.name}
          </h2>
          <StatusChip state={status.state}>{status.label}</StatusChip>
        </div>
        {hasMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${connection.name}`}
                className="-mt-1 -mr-1.5"
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-lg shadow-lg">
              {can.update ? (
                <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
              ) : null}
              {can.update && can.delete ? <DropdownMenuSeparator /> : null}
              {can.delete ? (
                <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(true)}>
                  Remove
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-[0.8125rem] text-ink-secondary min-[640px]:grid-cols-3">
        <div className="flex items-center gap-2">
          <dt className="sr-only">API key</dt>
          <KeyRound aria-hidden className="size-4 text-ink-muted" />
          <dd>
            <code className="rounded-sm bg-canvas-sunken px-1.5 py-0.5 font-mono text-xs">
              re_••••{connection.apiKeyLast4 ?? "••••"}
            </code>
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="sr-only">Webhook</dt>
          {connection.webhookRegistered ? (
            <Check aria-hidden className="size-4 text-success" />
          ) : (
            <CircleAlert aria-hidden className="size-4 text-warning" />
          )}
          <dd>{connection.webhookRegistered ? "Webhook registered" : "Webhook not registered"}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="sr-only">Last event</dt>
          <Radio aria-hidden className="size-4 text-ink-muted" />
          <dd suppressHydrationWarning>
            {connection.lastEventAt
              ? `Last event ${timeAgo(connection.lastEventAt)}`
              : "No events yet"}
          </dd>
        </div>
      </dl>

      {reason ? (
        <div
          role="status"
          className="flex flex-wrap items-start justify-between gap-3 rounded-md bg-warning-soft px-3 py-2.5 text-[0.8125rem] leading-snug text-warning-ink"
        >
          <p className="max-w-[62ch] min-w-0">{reason}</p>
          {canRetry ? (
            <Button size="sm" variant="outline" onClick={retry} disabled={retrying}>
              <RefreshCw aria-hidden className={retrying ? "animate-spin" : undefined} />
              {retrying ? "Retrying…" : "Retry"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {can.update ? (
        <RenameConnectionDialog
          orgSlug={orgSlug}
          connection={connection}
          open={renaming}
          onOpenChange={setRenaming}
        />
      ) : null}
      {can.delete ? (
        <RemoveConnectionDialog
          orgSlug={orgSlug}
          connection={connection}
          open={removing}
          onOpenChange={setRemoving}
        />
      ) : null}
    </article>
  );
}
