import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { STATUS_FILTERS, statusLabel, statusState } from "@/components/activity/status";
import { StatusChip } from "@/components/app/status-chip";
import { relativeTime, useNow } from "@/components/inbox/format";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import {
  getInsightFilterOptions,
  listActivity,
  type ActivityFilters,
  type ActivityRow,
} from "@/lib/api";

const selectClass =
  "h-9 min-w-0 rounded-md border border-line-strong bg-surface px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent";

type FilterState = {
  q: string;
  status: string;
  direction: "" | "inbound" | "outbound";
  connectionId: string;
  domainId: string;
};

const EMPTY: FilterState = {
  q: "",
  status: "",
  direction: "",
  connectionId: "",
  domainId: "",
};

function Row({ orgSlug, row }: { orgSlug: string; row: ActivityRow }) {
  const now = useNow();
  const outbound = row.direction === "outbound";
  const [first, ...rest] = row.to;
  const party = outbound
    ? `${first ?? "(no recipients)"}${rest.length ? ` +${rest.length}` : ""}`
    : row.from.address;
  const Arrow = outbound ? ArrowUpRight : ArrowDownLeft;

  return (
    <li data-testid="activity-row">
      <Link
        to="/$orgSlug/activity/$emailId"
        params={{ orgSlug, emailId: row.id }}
        className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 transition-colors duration-150 outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-accent md:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1.6fr)_7.5rem] md:gap-y-0"
      >
        <span className="order-2 justify-self-start md:order-none">
          <StatusChip state={statusState(row.status)}>{statusLabel(row.status)}</StatusChip>
        </span>
        <span className="order-1 flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold md:order-none">
          <Arrow
            aria-label={outbound ? "Sent" : "Received"}
            className="size-3.5 flex-none text-ink-muted"
          />
          <span className="truncate">{party}</span>
        </span>
        <span className="order-3 col-span-2 truncate text-[13px] text-ink-muted md:order-none md:col-span-1">
          {row.subject || "(no subject)"}
          {row.openCount > 1 ? (
            <span className="text-ink-muted"> · opened {row.openCount}×</span>
          ) : null}
        </span>
        <time
          dateTime={row.at}
          title={new Date(row.at).toISOString()}
          className="order-1 justify-self-end text-xs text-ink-muted tabular-nums md:order-none"
        >
          {now ? relativeTime(row.at, now) : row.at.slice(0, 10)}
        </time>
      </Link>
    </li>
  );
}

export function ActivityPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/activity" });
  const [draft, setDraft] = useState<FilterState>(EMPTY);
  const [applied, setApplied] = useState<FilterState>(EMPTY);

  const options = useQuery({
    queryKey: ["insight-options", orgSlug],
    queryFn: () => getInsightFilterOptions(orgSlug),
  });

  const filterKey = useMemo(
    () =>
      [
        applied.q,
        applied.status,
        applied.direction,
        applied.connectionId,
        applied.domainId,
      ].join("|"),
    [applied],
  );

  const list = useInfiniteQuery({
    queryKey: ["activity", orgSlug, filterKey],
    queryFn: ({ pageParam }) => {
      const filters: ActivityFilters = {
        q: applied.q || undefined,
        status: applied.status || undefined,
        direction: applied.direction || undefined,
        connectionId: applied.connectionId || undefined,
        domainId: applied.domainId || undefined,
        cursor: pageParam ?? undefined,
      };
      return listActivity(orgSlug, filters);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const active = Object.values(applied).some(Boolean);
  const domains = (options.data?.domains ?? []).filter(
    (d) => !draft.connectionId || d.connectionId === draft.connectionId,
  );

  function applyFilters(next: FilterState = draft) {
    setApplied(next);
    setDraft(next);
  }

  return (
    <ResourcePage title="Activity" description="Every sent and received email, with delivery status.">
      <div
        className="grid gap-3 rounded-xl bg-surface p-4 shadow-md"
        role="search"
        aria-label="Filter activity"
      >
        <label className="relative grid gap-1 text-[0.75rem] font-medium text-ink-muted">
          Search
          <span className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-muted"
            />
            <input
              type="search"
              value={draft.q}
              onChange={(e) => setDraft((f) => ({ ...f, q: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder="Subject or address"
              className={`${selectClass} w-full pl-8`}
              aria-label="Search"
            />
          </span>
        </label>
        <div className="grid gap-3 min-[720px]:grid-cols-4">
          <label className="grid gap-1 text-[0.75rem] font-medium text-ink-muted">
            Status
            <select
              className={selectClass}
              value={draft.status}
              onChange={(e) => {
                const next = { ...draft, status: e.target.value };
                setDraft(next);
                applyFilters(next);
              }}
              aria-label="Status"
            >
              <option value="">Any status</option>
              {STATUS_FILTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[0.75rem] font-medium text-ink-muted">
            Direction
            <select
              className={selectClass}
              value={draft.direction}
              onChange={(e) => {
                const next = {
                  ...draft,
                  direction: e.target.value as FilterState["direction"],
                };
                setDraft(next);
                applyFilters(next);
              }}
              aria-label="Direction"
            >
              <option value="">Sent and received</option>
              <option value="outbound">Sent</option>
              <option value="inbound">Received</option>
            </select>
          </label>
          <label className="grid gap-1 text-[0.75rem] font-medium text-ink-muted">
            Connection
            <select
              className={selectClass}
              value={draft.connectionId}
              onChange={(e) => {
                const next = { ...draft, connectionId: e.target.value, domainId: "" };
                setDraft(next);
                applyFilters(next);
              }}
              aria-label="Connection"
            >
              <option value="">Any connection</option>
              {(options.data?.connections ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[0.75rem] font-medium text-ink-muted">
            Domain
            <select
              className={selectClass}
              value={draft.domainId}
              onChange={(e) => {
                const next = { ...draft, domainId: e.target.value };
                setDraft(next);
                applyFilters(next);
              }}
              aria-label="Domain"
            >
              <option value="">Any domain</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => applyFilters()}
            className="h-8 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover"
          >
            Search
          </button>
          {active ? (
            <button
              type="button"
              onClick={() => {
                setDraft(EMPTY);
                setApplied(EMPTY);
              }}
              className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-sm font-semibold text-ink-muted hover:text-ink"
            >
              <X aria-hidden className="size-3.5" /> Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {list.isPending ? (
        <ResourcePending />
      ) : list.isError ? (
        <ResourceError message="Could not load activity." />
      ) : items.length === 0 ? (
        <ResourceEmpty>
          {active ? "Nothing matches these filters." : "No activity yet."}
        </ResourceEmpty>
      ) : (
        <>
          <ul className="grid gap-0.5 rounded-xl bg-surface p-1 shadow-md" aria-label="Activity">
            {items.map((row) => (
              <Row key={row.id} orgSlug={orgSlug} row={row} />
            ))}
          </ul>
          {list.hasNextPage ? (
            <div className="flex justify-center">
              <button
                type="button"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
                className="h-9 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold hover:bg-canvas disabled:opacity-50"
              >
                {list.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </ResourcePage>
  );
}
