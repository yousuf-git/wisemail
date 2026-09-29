"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { LiveRefresh } from "@/components/app/live-refresh";
import { StatusChip } from "@/components/app/status-chip";
import { relativeTime, useNow } from "@/components/inbox/format";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BroadcastRowDTO, ConnectionOptionDTO } from "@/lib/dto/audience";
import {
  BROADCAST_STATUS_OPTIONS,
  broadcastStatusLabel,
  broadcastStatusState,
  percent,
} from "./status";

const ALL = "__all";

function whenOf(row: BroadcastRowDTO): { label: string; iso: string } {
  if (row.status === "scheduled" && row.scheduledAt)
    return { label: "Sends", iso: row.scheduledAt };
  if (row.sentAt) return { label: "Sent", iso: row.sentAt };
  return { label: "Edited", iso: row.updatedAt };
}

/** Broadcasts across connections with their status and, once sent, headline numbers (PRD §5.9). */
export function BroadcastsView({
  orgSlug,
  broadcasts,
  connections,
  canCreate,
}: {
  orgSlug: string;
  broadcasts: BroadcastRowDTO[];
  connections: ConnectionOptionDTO[];
  canCreate: boolean;
}) {
  const now = useNow();
  const [status, setStatus] = useState("");
  const rows = status ? broadcasts.filter((b) => b.status === status) : broadcasts;
  const multi = connections.length > 1;
  const writable = connections.some((c) => c.writable);

  const newButton = canCreate ? (
    <Button asChild className="font-bold">
      <Link href={`/${orgSlug}/broadcasts/new`} aria-disabled={!writable}>
        <Plus aria-hidden /> New broadcast
      </Link>
    </Button>
  ) : null;

  if (connections.length === 0) {
    return (
      <EmptyState title="Connect Resend to send broadcasts" mood="idle">
        Broadcasts go out through your Resend accounts.{" "}
        <Link
          className="font-semibold text-accent underline"
          href={`/${orgSlug}/settings/connections`}
        >
          Open Connections
        </Link>
        .
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-3">
      <LiveRefresh topics={["broadcasts"]} />
      {broadcasts.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Select value={status || ALL} onValueChange={(v) => setStatus(v === ALL ? "" : v)}>
            <SelectTrigger size="sm" aria-label="Status" className="min-w-[8.5rem] bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={ALL}>Any status</SelectItem>
              {BROADCAST_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {newButton}
        </div>
      ) : null}
      {broadcasts.length === 0 ? (
        <EmptyState title="No broadcasts yet" mood="happy" action={newButton}>
          Write a message, pick a segment, preview it, then send it now or schedule it. Results show
          up here afterwards.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No broadcasts with that status"
          mood="detective"
          mascotSize={112}
          action={
            <Button type="button" variant="outline" onClick={() => setStatus("")}>
              Show all
            </Button>
          }
        >
          Try another status.
        </EmptyState>
      ) : (
        <ul role="list" className="grid gap-0.5 rounded-xl bg-surface p-1.5 shadow-md">
          {rows.map((b) => {
            const when = whenOf(b);
            return (
              <li key={b.id} data-testid="broadcast-row">
                <Link
                  href={`/${orgSlug}/broadcasts/${b.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-accent min-[760px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_9rem_7rem_7.5rem]"
                >
                  <span className="order-1 min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold">{b.name}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {b.subject || "(no subject)"}
                    </span>
                  </span>
                  <span className="order-2 justify-self-end min-[760px]:order-5">
                    <StatusChip state={broadcastStatusState(b.status)}>
                      {broadcastStatusLabel(b.status)}
                    </StatusChip>
                  </span>
                  <span className="order-3 col-span-2 truncate text-[13px] text-ink-muted min-[760px]:order-2 min-[760px]:col-span-1">
                    {[b.segmentName ?? "No segment", multi ? b.connectionName : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="order-4 col-span-2 truncate text-xs text-ink-muted tabular-nums min-[760px]:order-3 min-[760px]:col-span-1">
                    {b.stats && b.stats.recipients > 0
                      ? `${b.stats.recipients.toLocaleString()} sent · ${percent(b.stats.opened, b.stats.delivered)} opened`
                      : ""}
                  </span>
                  <time
                    dateTime={when.iso}
                    className="order-5 col-span-2 text-xs text-ink-faint tabular-nums min-[760px]:order-4 min-[760px]:col-span-1 min-[760px]:text-right"
                  >
                    {when.label}{" "}
                    {b.status === "scheduled"
                      ? new Date(when.iso).toLocaleString([], {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : now
                        ? relativeTime(when.iso, now)
                        : when.iso.slice(0, 10)}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
