"use client";

import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { cancelScheduledAction, rescheduleAction } from "@/app/(app)/[orgSlug]/scheduled/actions";
import { statusLabel, statusState } from "@/components/activity/status";
import { EmptyState } from "@/components/app/empty-state";
import { StatusChip } from "@/components/app/status-chip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { MailListRowDTO, Page } from "@/lib/dto/mail";
import { useLiveTopics } from "@/lib/realtime/live-context";
import { topics } from "@/lib/realtime/topics";
import { useLiveFallbackInterval } from "@/lib/realtime/use-live-query";
import { fetchThreadList, threadListKey } from "./api";
import { absoluteTime, useNow } from "./format";

/** `datetime-local` value ("2026-09-30T14:30") for a Date in the browser's time zone. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function inTime(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return "sending now";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `in ${Math.max(1, minutes)}m`;
  if (minutes < 60 * 24) return `in ${Math.round(minutes / 60)}h`;
  return `in ${Math.round(minutes / 60 / 24)}d`;
}

function RescheduleDialog({
  orgSlug,
  row,
  onClose,
  onDone,
}: {
  orgSlug: string;
  row: MailListRowDTO | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [min, setMin] = useState<string | undefined>(undefined);

  return (
    <Dialog
      open={!!row}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setError(null);
        }
      }}
    >
      <DialogContent
        onOpenAutoFocus={() => {
          setMin(toLocalInput(new Date(Date.now() + 60_000)));
          if (row?.scheduledAt) setValue(toLocalInput(new Date(row.scheduledAt)));
        }}
      >
        <DialogHeader>
          <DialogTitle>Reschedule email</DialogTitle>
          <DialogDescription className="truncate">{row?.subject}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!row) return;
            const at = new Date(value);
            if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
              return setError("Pick a time in the future.");
            }
            setPending(true);
            const result = await rescheduleAction(orgSlug, {
              emailId: row.id,
              scheduledAt: at,
            });
            setPending(false);
            if (!result.ok) return setError(result.error.message);
            toast.success("Rescheduled");
            onDone();
            onClose();
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium">
            Send at
            <Input
              type="datetime-local"
              value={value}
              min={min}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              aria-invalid={!!error}
              required
            />
            {error ? (
              <span role="alert" className="text-sm text-danger-ink">
                {error}
              </span>
            ) : (
              <span className="text-xs font-normal text-ink-muted">Your local time.</span>
            )}
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Keep current time
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Reschedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduledView({
  orgSlug,
  initialList,
  canSend,
  hasConnection,
  canManageConnections,
}: {
  orgSlug: string;
  initialList: Page<MailListRowDTO>;
  canSend: boolean;
  hasConnection: boolean;
  canManageConnections: boolean;
}) {
  const queryClient = useQueryClient();
  const now = useNow();
  const params = { orgSlug, folder: "scheduled" as const };
  const list = useInfiniteQuery({
    queryKey: threadListKey(params),
    queryFn: ({ pageParam }) => fetchThreadList(params, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: Page<MailListRowDTO>) => last.nextCursor,
    initialData: {
      pages: [initialList],
      pageParams: [null],
    } satisfies InfiniteData<Page<MailListRowDTO>, string | null>,
    refetchInterval: useLiveFallbackInterval(),
    enabled: hasConnection,
  });
  useLiveTopics([topics.threads()], () => {
    void queryClient.invalidateQueries({ queryKey: ["threads", orgSlug] });
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const [editing, setEditing] = useState<MailListRowDTO | null>(null);
  const [canceling, setCanceling] = useState<MailListRowDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["threads", orgSlug] });

  if (!hasConnection) {
    return (
      <EmptyState
        title="Connect Resend to schedule email"
        action={
          canManageConnections ? (
            <Button asChild>
              <Link href={`/${orgSlug}/settings/connections`}>Connect an account</Link>
            </Button>
          ) : null
        }
      >
        Emails you schedule wait here until Resend sends them.
      </EmptyState>
    );
  }

  if (list.isPending) {
    return <Skeleton className="h-40 w-full" aria-busy="true" />;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        mood="happy"
        title="Nothing scheduled"
        action={
          canSend ? (
            <Button asChild>
              <Link href={`/${orgSlug}/compose`}>Write an email</Link>
            </Button>
          ) : null
        }
      >
        Pick a time in the composer and the email waits here until it is sent. You can change or
        cancel it until then.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-3">
      <ul className="grid gap-2" aria-label="Scheduled emails" data-testid="scheduled-list">
        {rows.map((row) => {
          const inFlight = !!row.scheduledAt && !!now && new Date(row.scheduledAt).getTime() <= now;
          return (
            <li
              key={row.id}
              data-testid="scheduled-row"
              className="grid gap-x-4 gap-y-2 rounded-xl bg-surface p-4 shadow-md sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="grid min-w-0 gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{row.subject || "(no subject)"}</span>
                  <StatusChip state={inFlight ? "info" : statusState(row.status ?? "scheduled")}>
                    {inFlight ? "Sending" : statusLabel(row.status ?? "scheduled")}
                  </StatusChip>
                </div>
                <p className="truncate text-sm text-ink-muted">To {(row.peopleLabels ?? row.people).join(", ")}</p>
                {row.scheduledAt ? (
                  <p className="flex items-center gap-1.5 text-sm text-ink-secondary">
                    <CalendarClock aria-hidden className="size-4 text-ink-faint" />
                    <time dateTime={row.scheduledAt}>
                      {absoluteTime(row.scheduledAt, now ? undefined : "UTC")}
                    </time>
                    {now ? (
                      <span className="text-ink-muted">· {inTime(row.scheduledAt, now)}</span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              {canSend ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={inFlight}
                    onClick={() => setEditing(row)}
                  >
                    Reschedule
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={inFlight}
                    onClick={() => setCanceling(row)}
                  >
                    Cancel send
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {list.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          className="justify-self-center"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {list.isFetchingNextPage ? "Loading…" : "Show more"}
        </Button>
      ) : null}

      <RescheduleDialog
        orgSlug={orgSlug}
        row={editing}
        onClose={() => setEditing(null)}
        onDone={() => void refresh()}
      />

      <Dialog open={!!canceling} onOpenChange={(open) => !open && setCanceling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this email?</DialogTitle>
            <DialogDescription>
              “{canceling?.subject}” won&apos;t be sent. If Resend has already sent it, it stays
              sent and we&apos;ll tell you.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCanceling(null)}>
              Keep scheduled
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!canceling) return;
                setBusy(true);
                const result = await cancelScheduledAction(orgSlug, { emailId: canceling.id });
                setBusy(false);
                if (!result.ok) {
                  toast.error(result.error.message);
                } else {
                  toast.success("Canceled. It won't be sent.");
                }
                setCanceling(null);
                void refresh();
              }}
            >
              {busy ? "Canceling…" : "Cancel send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
