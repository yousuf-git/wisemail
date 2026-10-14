import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { ResourcePending } from "@/components/resource-page";
import { cancelScheduled, rescheduleScheduled } from "@/lib/actions";
import { listThreads, type MailListRow } from "@/lib/api";

import { absoluteTime, useNow } from "./format";

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
  row: MailListRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [value, setValue] = useState("");
  const [min, setMin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = !!row;

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      const nextMin = toLocalInput(new Date(Date.now() + 60_000));
      setMin(nextMin);
      setValue(row?.scheduledAt ? toLocalInput(new Date(row.scheduledAt)) : nextMin);
      setError(null);
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open, row]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto w-[min(100%,24rem)] rounded-xl border border-line bg-surface p-0 shadow-lg backdrop:bg-ink/40"
      onClose={onClose}
    >
      <form
        className="grid gap-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!row) return;
          const at = new Date(value);
          if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
            setError("Pick a time in the future.");
            return;
          }
          setPending(true);
          const result = await rescheduleScheduled(orgSlug, row.id, at);
          setPending(false);
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
          onDone();
          onClose();
        }}
      >
        <div className="grid gap-1">
          <h2 id={titleId} className="text-base font-semibold">
            Reschedule email
          </h2>
          <p className="truncate text-sm text-ink-muted">{row?.subject || "(no subject)"}</p>
        </div>
        <label className="grid gap-1.5 text-sm font-medium">
          Send at
          <input
            type="datetime-local"
            value={value}
            min={min || undefined}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            required
            className="h-10 rounded-control border border-line bg-canvas px-3 text-sm"
          />
          {error ? (
            <span role="alert" className="text-sm font-normal text-danger-ink">
              {error}
            </span>
          ) : (
            <span className="text-xs font-normal text-ink-muted">Your local time.</span>
          )}
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-control px-3 text-sm font-medium text-ink-secondary hover:bg-canvas-sunken"
          >
            Keep current time
          </button>
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            {pending ? "Saving…" : "Reschedule"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function CancelDialog({
  orgSlug,
  row,
  onClose,
  onDone,
}: {
  orgSlug: string;
  row: MailListRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = !!row;

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      setError(null);
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto w-[min(100%,24rem)] rounded-xl border border-line bg-surface p-0 shadow-lg backdrop:bg-ink/40"
      onClose={onClose}
    >
      <div className="grid gap-4 p-5">
        <div className="grid gap-1">
          <h2 id={titleId} className="text-base font-semibold">
            Cancel this email?
          </h2>
          <p className="text-sm text-ink-muted">
            “{row?.subject || "(no subject)"}” won&apos;t be sent. If Resend has already sent it, it
            stays sent and we&apos;ll tell you.
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-control px-3 text-sm font-medium text-ink-secondary hover:bg-canvas-sunken"
          >
            Keep scheduled
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!row) return;
              setBusy(true);
              const result = await cancelScheduled(orgSlug, row.id);
              setBusy(false);
              if (!result.ok) {
                setError(result.error.message);
                return;
              }
              onDone();
              onClose();
            }}
            className="h-9 rounded-control bg-danger px-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Canceling…" : "Cancel send"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function ScheduledView({ orgSlug }: { orgSlug: string }) {
  const queryClient = useQueryClient();
  const now = useNow();
  const [editing, setEditing] = useState<MailListRow | null>(null);
  const [canceling, setCanceling] = useState<MailListRow | null>(null);

  const list = useInfiniteQuery({
    queryKey: ["threads", orgSlug, "scheduled", ""],
    queryFn: ({ pageParam }) =>
      listThreads({ orgSlug, folder: "scheduled", cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["threads", orgSlug] });

  return (
    <section className="grid gap-3">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Scheduled</h1>
        <p className="text-sm text-ink-muted">
          Emails waiting for their send time. Change or cancel until Resend starts sending.
        </p>
      </header>

      {list.isPending ? (
        <ResourcePending />
      ) : list.isError ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          Could not load scheduled mail.
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          mood="happy"
          title="Nothing scheduled"
          action={
            <Link
              to="/$orgSlug/compose"
              params={{ orgSlug }}
              className="inline-flex h-9 items-center rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink"
            >
              Write an email
            </Link>
          }
        >
          Pick a time in the composer and the email waits here until it is sent.
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          <ul className="grid gap-2" aria-label="Scheduled emails" data-testid="scheduled-list">
            {rows.map((row) => {
              const inFlight =
                !!row.scheduledAt && !!now && new Date(row.scheduledAt).getTime() <= now;
              return (
                <li
                  key={row.id}
                  data-testid="scheduled-row"
                  className="grid gap-x-4 gap-y-2 rounded-xl bg-surface p-4 shadow-md sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="grid min-w-0 gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">
                        {row.subject || "(no subject)"}
                      </span>
                      <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info-ink">
                        {inFlight ? "Sending" : "Scheduled"}
                      </span>
                    </div>
                    <p className="truncate text-sm text-ink-muted">
                      To {(row.peopleLabels ?? row.people).join(", ") || "(none)"}
                    </p>
                    {row.scheduledAt ? (
                      <p className="flex items-center gap-1.5 text-sm text-ink-secondary">
                        <CalendarClock aria-hidden className="size-4 text-ink-muted" />
                        <time dateTime={row.scheduledAt}>
                          {absoluteTime(row.scheduledAt, now ? undefined : "UTC")}
                        </time>
                        {now ? (
                          <span className="text-ink-muted">· {inTime(row.scheduledAt, now)}</span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={inFlight}
                      onClick={() => setEditing(row)}
                      className="h-8 rounded-control border border-line px-2.5 text-xs font-semibold hover:bg-canvas-sunken disabled:opacity-50"
                    >
                      Reschedule
                    </button>
                    <button
                      type="button"
                      disabled={inFlight}
                      onClick={() => setCanceling(row)}
                      className="h-8 rounded-control px-2.5 text-xs font-semibold text-ink-secondary hover:bg-canvas-sunken disabled:opacity-50"
                    >
                      Cancel send
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {list.hasNextPage ? (
            <button
              type="button"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
              className="h-9 justify-self-center rounded-control border border-line px-4 text-sm font-medium disabled:opacity-50"
            >
              {list.isFetchingNextPage ? "Loading…" : "Show more"}
            </button>
          ) : null}
        </div>
      )}

      <RescheduleDialog
        orgSlug={orgSlug}
        row={editing}
        onClose={() => setEditing(null)}
        onDone={() => void refresh()}
      />
      <CancelDialog
        orgSlug={orgSlug}
        row={canceling}
        onClose={() => setCanceling(null)}
        onDone={() => void refresh()}
      />
    </section>
  );
}
