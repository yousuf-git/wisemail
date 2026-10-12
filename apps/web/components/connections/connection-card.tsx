"use client";

import {
  Check,
  ChevronDown,
  CircleAlert,
  KeyRound,
  MoreHorizontal,
  Radio,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
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
import { summarizeChecklist } from "@/lib/dto/checklist";
import { STATUS_REASON_COPY, type ConnectionDTO } from "@/lib/dto/connection";
import { cn } from "@/lib/utils";
import { Checklist } from "./checklist";
import { SyncStatus } from "./sync-status";
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
  const [checklistOpen, setChecklistOpen] = useState(false);
  const status = CONNECTION_STATUS[connection.status];
  const reason = connection.statusReason ? STATUS_REASON_COPY[connection.statusReason] : null;
  const canRetry =
    can.update && connection.status === "needs_attention" && !connection.webhookRegistered;
  const hasMenu = can.update || can.delete;
  const summary = connection.checklist ? summarizeChecklist(connection.checklist) : null;
  const checklistId = `checklist-${connection.id}`;
  const manageable = connection.status !== "read_only" && connection.status !== "disabled";

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
          <Link
            href={`/${orgSlug}/settings/connections/${connection.id}`}
            className="rounded-sm text-[0.8125rem] font-medium text-ink-secondary underline-offset-4 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-accent"
          >
            Details
          </Link>
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

      <SyncStatus
        orgSlug={orgSlug}
        connectionId={connection.id}
        sync={connection.sync}
        lastSyncAt={connection.lastSyncAt}
        canSync={can.update && connection.status !== "disabled"}
      />

      <div className="grid gap-2">
        <button
          type="button"
          aria-expanded={checklistOpen}
          aria-controls={checklistId}
          onClick={() => setChecklistOpen((open) => !open)}
          className="flex items-center justify-between gap-3 rounded-md text-left text-[0.8125rem] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span>
            Setup checklist
            <span className="ml-2 font-normal text-ink-muted" suppressHydrationWarning>
              {summary ? `${summary.ok} of ${summary.total} ready` : "Appears after the first sync"}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 text-ink-muted transition-transform",
              checklistOpen && "rotate-180",
            )}
          />
        </button>
        <div id={checklistId} hidden={!checklistOpen}>
          {connection.checklist && connection.checklist.length > 0 ? (
            <Checklist
              orgSlug={orgSlug}
              connectionId={connection.id}
              items={connection.checklist}
              can={{ connection: can.update, domain: can.domainUpdate }}
              fixesDisabled={!manageable}
            />
          ) : (
            <p className="text-[0.8125rem] text-ink-muted">
              Once Wisemail has read your domains it lists what&apos;s ready and what needs a look.
            </p>
          )}
        </div>
      </div>

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
