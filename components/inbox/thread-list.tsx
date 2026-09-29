"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { MailFolder, MailListRowDTO } from "@/lib/dto/mail";
import { cn } from "@/lib/utils";
import { FOLDERS, inboxHref } from "./routes";
import { ThreadRow } from "./thread-row";

const ARRIVAL_MS = 1300;
/** More than this many changed rows at once is a bulk refresh (resync), not an arrival. */
const MAX_ARRIVALS = 5;

const stamp = (row: MailListRowDTO) => `${row.kind}-${row.id}:${row.lastMessageAt}`;

/**
 * Keys of rows that just arrived or moved to the top after a live refetch. Rows present on
 * first render, rows appended by pagination and folder/search changes never count.
 */
function useArrivals(rows: MailListRowDTO[], scope: string, loading: boolean): Set<string> {
  const previous = useRef<{ scope: string; stamps: string[] } | null>(null);
  const [arrived, setArrived] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (loading) {
      previous.current = null; // a fresh load (folder or search change) is not an arrival
      return;
    }
    const before = previous.current;
    const stamps = rows.map(stamp);
    previous.current = { scope, stamps };
    if (!before || before.scope !== scope) return;
    const known = new Set(before.stamps);
    // New or bumped rows sit above every row we already knew; appended pages sit below.
    const firstKnown = stamps.findIndex((st) => known.has(st));
    const limit = firstKnown === -1 ? (before.stamps.length === 0 ? rows.length : 0) : firstKnown;
    const fresh = rows.slice(0, limit);
    if (fresh.length === 0 || fresh.length > MAX_ARRIVALS) return;
    const keys = fresh.map((row) => `${row.kind}-${row.id}`);
    setArrived((current) => new Set([...current, ...keys]));
    setTimeout(
      () => setArrived((current) => new Set([...current].filter((k) => !keys.includes(k)))),
      ARRIVAL_MS,
    );
  }, [rows, scope, loading]);

  return arrived;
}

export function ThreadList({
  orgSlug,
  folder,
  rows,
  selectedId,
  query,
  onQuery,
  unreadOnly,
  onUnreadOnly,
  searchRef,
  loading,
  error,
  hasNext,
  fetchingNext,
  onFetchNext,
  onSelect,
  onRestore,
  empty,
}: {
  orgSlug: string;
  folder: MailFolder;
  rows: MailListRowDTO[];
  selectedId: string | null;
  query: string;
  onQuery: (value: string) => void;
  unreadOnly: boolean;
  onUnreadOnly: (value: boolean) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  loading: boolean;
  error: boolean;
  hasNext: boolean;
  fetchingNext: boolean;
  onFetchNext: () => void;
  onSelect: (row: MailListRowDTO) => void;
  onRestore: (row: MailListRowDTO) => void;
  /** Rendered when there are no rows (and nothing is loading). */
  empty: React.ReactNode;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const arrivals = useArrivals(rows, `${folder}|${query}|${unreadOnly}`, loading);

  // Infinite scroll: load the next page when the sentinel nears the bottom of the list.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNext) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !fetchingNext) onFetchNext();
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNext, fetchingNext, onFetchNext, rows.length]);

  return (
    <section aria-label="Conversations" className="flex min-h-0 flex-col">
      <div className="grid gap-2 p-3 pb-1.5">
        <nav aria-label="Mail folders" className="flex flex-wrap gap-1">
          {FOLDERS.map((f) => (
            <Link
              key={f.id}
              href={inboxHref(orgSlug, f.id)}
              aria-current={f.id === folder ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-[13px] font-semibold transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent",
                f.id === folder
                  ? "bg-accent-soft text-info-ink"
                  : "text-ink-muted hover:bg-canvas hover:text-ink",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-faint"
            />
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Search mail  ( / )"
              aria-label="Search mail"
              className="h-9 pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  onQuery("");
                  searchRef.current?.focus();
                }}
                className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-full text-ink-muted hover:bg-canvas-sunken"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            ) : null}
          </div>
          {folder === "inbox" ? (
            <Button
              type="button"
              size="sm"
              variant={unreadOnly ? "secondary" : "ghost"}
              aria-pressed={unreadOnly}
              onClick={() => onUnreadOnly(!unreadOnly)}
              className={cn(unreadOnly && "bg-accent-soft text-info-ink hover:bg-accent-soft")}
            >
              Unread
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {loading ? (
          <ul className="grid gap-1 p-1.5" aria-busy="true" aria-label="Loading conversations">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="grid grid-cols-[32px_1fr] items-center gap-2.5 px-1.5 py-2">
                <Skeleton className="size-8 rounded-full" />
                <div className="grid gap-1.5">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </li>
            ))}
          </ul>
        ) : error && rows.length === 0 ? (
          <p role="alert" className="p-4 text-sm text-ink-muted">
            We couldn&apos;t load your mail. Check your connection and try again.
          </p>
        ) : rows.length === 0 ? (
          <div className="p-2">{empty}</div>
        ) : (
          <>
            <ul role="list" className="grid gap-0.5" data-testid="thread-list">
              {rows.map((row) => (
                <ThreadRow
                  key={`${row.kind}-${row.id}`}
                  row={row}
                  folder={folder}
                  href={inboxHref(orgSlug, folder, row.threadId)}
                  selected={!!row.threadId && row.threadId === selectedId}
                  onSelect={onSelect}
                  onRestore={onRestore}
                  arrived={arrivals.has(`${row.kind}-${row.id}`)}
                />
              ))}
            </ul>
            <div ref={sentinel} aria-hidden className="h-px" />
            {fetchingNext ? (
              <p className="p-3 text-center text-xs text-ink-faint" role="status">
                Loading more…
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
