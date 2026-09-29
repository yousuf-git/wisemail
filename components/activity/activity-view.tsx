"use client";

import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, ListChecks, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { StatusChip } from "@/components/app/status-chip";
import { relativeTime, useNow } from "@/components/inbox/format";
import {
  activityKey,
  EMPTY_ACTIVITY_FILTERS,
  fetchActivity,
  type ActivityFilterState,
} from "@/components/inbox/api";
import { BulkBar } from "@/components/deletion/bulk-bar";
import { useBulkProgress } from "@/components/deletion/bulk-progress";
import { useRowSelection } from "@/components/deletion/use-selection";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveTopics } from "@/lib/realtime/live-context";
import { topics } from "@/lib/realtime/topics";
import { useLiveFallbackInterval } from "@/lib/realtime/use-live-query";
import type { ActivityRowDTO, Page } from "@/lib/dto/mail";
import type { BulkFilter } from "@/lib/deletion/filters";
import { activityBulkFilters, filtersToSearch, hasActiveFilters } from "./filters";
import { STATUS_FILTERS, statusLabel, statusState } from "./status";

const ALL = "__all";

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger size="sm" aria-label={label} className="min-w-[8.5rem] bg-surface">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ActivityRow({
  orgSlug,
  row,
  selecting = false,
  checked = false,
  onToggle,
}: {
  orgSlug: string;
  row: ActivityRowDTO;
  selecting?: boolean;
  checked?: boolean;
  onToggle?: (row: ActivityRowDTO) => void;
}) {
  const now = useNow();
  const outbound = row.direction === "outbound";
  const [first, ...rest] = row.to;
  const party = outbound
    ? `${first ?? "(no recipients)"}${rest.length ? ` +${rest.length}` : ""}`
    : row.from.address;
  const Arrow = outbound ? ArrowUpRight : ArrowDownLeft;
  return (
    <li
      data-testid="activity-row"
      className={selecting ? "flex items-center gap-1 rounded-lg" : undefined}
      data-checked={selecting ? checked : undefined}
    >
      {selecting ? (
        <Checkbox
          checked={checked}
          onCheckedChange={() => onToggle?.(row)}
          aria-label={`Select ${row.subject || "(no subject)"}`}
          className="ml-2 shrink-0"
        />
      ) : null}
      <Link
        href={`/${orgSlug}/activity/${row.id}`}
        onClick={(event) => {
          if (!selecting) return;
          event.preventDefault();
          onToggle?.(row);
        }}
        className={`grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 transition-colors duration-150 outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-accent md:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1.6fr)_7.5rem] md:gap-y-0 ${checked ? "bg-accent-soft" : ""}`}
      >
        <span className="order-2 justify-self-start md:order-none">
          <StatusChip state={statusState(row.status)}>{statusLabel(row.status)}</StatusChip>
        </span>
        <span className="order-1 flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold md:order-none">
          <Arrow
            aria-label={outbound ? "Sent" : "Received"}
            className="size-3.5 flex-none text-ink-faint"
          />
          <span className="truncate">{party}</span>
        </span>
        <span className="order-3 col-span-2 truncate text-[13px] text-ink-muted md:order-none md:col-span-1">
          {row.subject || "(no subject)"}
          {row.openCount > 1 ? (
            <span className="text-ink-faint"> · opened {row.openCount}×</span>
          ) : null}
        </span>
        <time
          dateTime={row.at}
          title={new Date(row.at).toISOString()}
          className="order-1 justify-self-end text-xs text-ink-faint tabular-nums md:order-none"
        >
          {now ? relativeTime(row.at, now) : row.at.slice(0, 10)}
        </time>
      </Link>
    </li>
  );
}

export type ActivityViewProps = {
  orgSlug: string;
  initialFilters: ActivityFilterState;
  /** First page rendered by the server for `initialFilters` (null when it did not fetch one). */
  initialPage: Page<ActivityRowDTO> | null;
  hasConnection: boolean;
  canManageConnections: boolean;
  connections: { id: string; name: string }[];
  domains: { id: string; name: string; connectionId: string }[];
  /** Move to Trash (email:trash). */
  canTrash?: boolean;
  /** Owner/Admin: delete permanently. */
  canDelete?: boolean;
};

/**
 * Activity log (PRD §5.4): every email in both directions, newest first, with filters for status,
 * direction, connection, domain, date range and search. An email address in the search box is a
 * recipient lookup. Filters live in the URL (`replaceState`), pages load as you scroll.
 */
export function ActivityView({
  orgSlug,
  initialFilters,
  initialPage,
  hasConnection,
  canManageConnections,
  connections,
  domains,
  canTrash = false,
  canDelete = false,
}: ActivityViewProps) {
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const sentinel = useRef<HTMLDivElement>(null);

  // Text is debounced; selects and dates apply at once.
  useEffect(() => {
    const id = setTimeout(() => setApplied(filters), filters.q === applied.q ? 0 : 250);
    return () => clearTimeout(id);
  }, [filters, applied.q]);
  useEffect(() => {
    window.history.replaceState(null, "", `${window.location.pathname}${filtersToSearch(applied)}`);
  }, [applied]);

  const sameAsInitial = JSON.stringify(applied) === JSON.stringify(initialFilters);
  const list = useInfiniteQuery({
    queryKey: activityKey(orgSlug, applied),
    queryFn: ({ pageParam }) => fetchActivity(orgSlug, applied, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: Page<ActivityRowDTO>) => last.nextCursor,
    initialData:
      sameAsInitial && initialPage
        ? ({ pages: [initialPage], pageParams: [null] } satisfies InfiniteData<
            Page<ActivityRowDTO>,
            string | null
          >)
        : undefined,
    enabled: hasConnection,
    refetchInterval: useLiveFallbackInterval(),
  });
  const queryClient = useQueryClient();
  useLiveTopics([topics.emails()], () => {
    void queryClient.invalidateQueries({ queryKey: ["activity", orgSlug] });
  });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  // Bulk selection: move to Trash / delete permanently, also "all matching this filter".
  const selectableRows = useMemo(
    () => rows.map((r) => ({ kind: "email" as const, id: r.id })),
    [rows],
  );
  const selection = useRowSelection(selectableRows);
  const progress = useBulkProgress(orgSlug, () => {
    void queryClient.invalidateQueries({ queryKey: ["activity", orgSlug] });
  });
  const bulkFilter: BulkFilter = {
    source: "activity",
    filters: activityBulkFilters(applied),
  };

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "320px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rows.length]);

  if (!hasConnection) {
    return (
      <EmptyState
        title="Connect Resend to see your activity"
        action={
          canManageConnections ? (
            <Button asChild>
              <Link href={`/${orgSlug}/settings/connections`}>Connect an account</Link>
            </Button>
          ) : null
        }
      >
        Every email your Resend accounts send or receive appears here with its full timeline.
      </EmptyState>
    );
  }

  const set = (patch: Partial<ActivityFilterState>) => setFilters((f) => ({ ...f, ...patch }));
  const visibleDomains = filters.connectionId
    ? domains.filter((d) => d.connectionId === filters.connectionId)
    : domains;
  const filtered = hasActiveFilters(applied);
  const clear = () => {
    setFilters(EMPTY_ACTIVITY_FILTERS);
    setApplied(EMPTY_ACTIVITY_FILTERS);
  };

  return (
    <div className="grid gap-3">
      <div role="search" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 md:max-w-sm">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-faint"
          />
          <Input
            type="search"
            value={filters.q}
            onChange={(event) => set({ q: event.target.value })}
            placeholder="Search subject, or paste an address"
            aria-label="Search activity"
            className="h-8 bg-surface pr-3 pl-8 [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(status) => set({ status })}
          options={STATUS_FILTERS}
          allLabel="Any status"
        />
        <FilterSelect
          label="Direction"
          value={filters.direction}
          onChange={(direction) => set({ direction })}
          options={[
            { value: "outbound", label: "Sent" },
            { value: "inbound", label: "Received" },
          ]}
          allLabel="Sent and received"
        />
        {connections.length > 1 ? (
          <FilterSelect
            label="Connection"
            value={filters.connectionId}
            onChange={(connectionId) => set({ connectionId, domainId: "" })}
            options={connections.map((c) => ({ value: c.id, label: c.name }))}
            allLabel="All connections"
          />
        ) : null}
        {visibleDomains.length > 0 ? (
          <FilterSelect
            label="Domain"
            value={filters.domainId}
            onChange={(domainId) => set({ domainId })}
            options={visibleDomains.map((d) => ({ value: d.id, label: d.name }))}
            allLabel="All domains"
          />
        ) : null}
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          From
          <Input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => set({ from: event.target.value })}
            aria-label="From date"
            className="h-8 w-auto bg-surface px-2 text-[13px]"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          To
          <Input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => set({ to: event.target.value })}
            aria-label="To date"
            className="h-8 w-auto bg-surface px-2 text-[13px]"
          />
        </label>
        {hasActiveFilters(filters) ? (
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            <X aria-hidden /> Clear filters
          </Button>
        ) : null}
        {canTrash || canDelete ? (
          <Button
            type="button"
            size="sm"
            variant={selection.selecting ? "secondary" : "outline"}
            aria-pressed={selection.selecting}
            onClick={() => (selection.selecting ? selection.stop() : selection.setSelecting(true))}
            className="ml-auto"
          >
            <ListChecks aria-hidden /> Select
          </Button>
        ) : null}
      </div>
      {progress.card}
      {selection.selecting ? (
        <div className="-mx-3">
          <BulkBar
            orgSlug={orgSlug}
            mode="activity"
            selection={selection}
            rows={selectableRows}
            hasMore={!!hasNextPage}
            filter={bulkFilter}
            canTrash={canTrash}
            canDelete={canDelete}
            noun="emails"
            onDone={() => void queryClient.invalidateQueries({ queryKey: ["activity", orgSlug] })}
            track={progress.track}
          />
        </div>
      ) : null}

      <section aria-label="Activity" className="rounded-xl bg-surface p-1.5 shadow-md">
        <div
          aria-hidden
          className="hidden grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1.6fr)_7.5rem] gap-x-3 px-3 py-2 text-[11px] font-semibold tracking-[0.06em] text-ink-faint uppercase md:grid"
        >
          <span>Status</span>
          <span>Recipient</span>
          <span>Subject</span>
          <span className="text-right">When</span>
        </div>
        {list.isPending ? (
          <ul className="grid gap-1 p-1.5" aria-busy="true" aria-label="Loading activity">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-11 w-full" />
              </li>
            ))}
          </ul>
        ) : list.isError && rows.length === 0 ? (
          <p role="alert" className="p-4 text-sm text-ink-muted">
            We couldn&apos;t load the activity log. Try again in a moment.
          </p>
        ) : rows.length === 0 ? (
          <div className="p-3">
            {filtered ? (
              <EmptyState
                mood="detective"
                mascotSize={112}
                title="No emails match these filters"
                action={
                  <Button type="button" variant="outline" onClick={clear}>
                    Clear filters
                  </Button>
                }
              >
                Widen the date range, or search for less of the subject.
              </EmptyState>
            ) : (
              <EmptyState
                mood="happy"
                mascotSize={112}
                title="Nothing in Activity yet"
                action={
                  <Button asChild>
                    <Link href={`/${orgSlug}/compose`}>Write an email</Link>
                  </Button>
                }
              >
                Emails show up here as soon as Resend reports them, with every step of their
                journey.
              </EmptyState>
            )}
          </div>
        ) : (
          <>
            <ul role="list" className="grid gap-0.5">
              {rows.map((row) => (
                <ActivityRow
                  key={row.id}
                  orgSlug={orgSlug}
                  row={row}
                  selecting={selection.selecting}
                  checked={selection.keys.has(`email-${row.id}`)}
                  onToggle={(r) => selection.toggle({ kind: "email", id: r.id })}
                />
              ))}
            </ul>
            <div ref={sentinel} aria-hidden className="h-px" />
            {isFetchingNextPage ? (
              <p role="status" className="p-3 text-center text-xs text-ink-faint">
                Loading more…
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
