import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { CATEGORY_LABEL, TRIAGE_CATEGORIES } from "@wisemail/shared";
import { ListChecks, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ThreadRow } from "@/components/inbox/thread-row";
import { ResourceEmpty } from "@/components/resource-page";
import { trashItems } from "@/lib/actions";
import { getAiStatus, listThreads, type MailListRow } from "@/lib/api";

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function rowKey(row: MailListRow) {
  return `${row.kind}:${row.id}`;
}

export function InboxPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/inbox" });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const debounced = useDebounced(query, 250);

  const ai = useQuery({
    queryKey: ["ai-status", orgSlug],
    queryFn: () => getAiStatus(orgSlug),
  });
  const triageOk =
    ai.data?.planIncluded && ai.data.enabled && ai.data.canUse && ai.data.features.triage;

  const list = useInfiniteQuery({
    queryKey: ["threads", orgSlug, "inbox", debounced, unreadOnly, category],
    queryFn: ({ pageParam }) =>
      listThreads({
        orgSlug,
        folder: "inbox",
        q: debounced.trim() || undefined,
        unread: unreadOnly || undefined,
        category: category || undefined,
        cursor: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  useEffect(() => {
    setSelected(new Set());
  }, [debounced, unreadOnly, category]);

  const trash = useMutation({
    mutationFn: (input: { threadIds?: string[]; emailIds?: string[] }) =>
      trashItems(orgSlug, input),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setSelected(new Set());
      setSelecting(false);
      await queryClient.invalidateQueries({ queryKey: ["threads", orgSlug] });
    },
    onError: () => setError("Could not trash the selection."),
  });

  const toggle = (row: MailListRow) => {
    const key = rowKey(row);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const trashSelection = () => {
    const threadIds: string[] = [];
    const emailIds: string[] = [];
    for (const row of rows) {
      if (!selected.has(rowKey(row))) continue;
      if (row.kind === "email") emailIds.push(row.id);
      else threadIds.push(row.id);
    }
    if (threadIds.length + emailIds.length === 0) return;
    trash.mutate({ threadIds, emailIds });
  };

  const searching = !!query.trim();
  const emptyCopy = searching
    ? `No results for “${query.trim()}”`
    : category
      ? "Nothing in this category"
      : unreadOnly
        ? "Nothing unread"
        : "Inbox zero";

  return (
    <section className="grid gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-ink-muted" data-tour="inbox-reply">
            Replies and conversations from your connected domains. Open a thread to reply or draft
            with AI.
          </p>
          <p
            data-tour="receipt-chip"
            className="mt-1 text-xs font-medium text-ink-muted"
          >
            Sent mail shows receipts: sent → delivered → opened
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (selecting) {
                setSelecting(false);
                setSelected(new Set());
              } else {
                setSelecting(true);
              }
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line px-3 text-xs font-medium hover:bg-canvas-sunken"
          >
            <ListChecks aria-hidden className="size-3.5" />
            {selecting ? "Cancel" : "Select"}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search subject, snippet, address…"
            className="h-9 w-full rounded-control border border-line bg-surface pr-8 pl-8 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
        <label className="inline-flex h-9 items-center gap-2 rounded-control border border-line bg-surface px-3 text-xs font-medium">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="size-3.5 rounded border-line"
          />
          Unread
        </label>
        {triageOk ? (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 rounded-control border border-line bg-surface px-2 text-xs font-medium outline-none focus:ring-2 focus:ring-accent"
            aria-label="Filter by AI category"
          >
            <option value="">All categories</option>
            {TRIAGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {selecting && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button
            type="button"
            disabled={trash.isPending}
            onClick={trashSelection}
            className="h-8 rounded-control bg-danger-soft px-3 text-xs font-semibold text-danger-ink hover:opacity-90 disabled:opacity-50"
          >
            {trash.isPending ? "Moving…" : "Move to Trash"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      {list.isPending ? (
        <p className="text-sm text-ink-muted">Loading threads…</p>
      ) : list.isError ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          Could not load inbox. Sign in and confirm the API is up.
        </p>
      ) : rows.length === 0 ? (
        <div data-tour="inbox-list">
          <ResourceEmpty
            mood={searching || unreadOnly || category ? "idle" : "sleep"}
            title={emptyCopy}
          >
            {searching || unreadOnly || category
              ? "Try clearing filters or searching something else."
              : "Replies from your domains will land here."}
          </ResourceEmpty>
        </div>
      ) : (
        <div data-tour="inbox-list" className="overflow-hidden rounded-lg border border-line bg-surface">
          <ul>
            {rows.map((row) => (
              <ThreadRow
                key={rowKey(row)}
                row={row}
                orgSlug={orgSlug}
                folder="inbox"
                selecting={selecting}
                checked={selected.has(rowKey(row))}
                onToggle={() => toggle(row)}
              />
            ))}
          </ul>
          {list.hasNextPage ? (
            <div className="border-t border-line p-2">
              <button
                type="button"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
                className="h-9 w-full rounded-control text-sm font-medium text-ink-secondary hover:bg-canvas-sunken disabled:opacity-50"
              >
                {list.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
