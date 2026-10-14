import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ScheduledView } from "@/components/inbox/scheduled-view";
import { ThreadRow } from "@/components/inbox/thread-row";
import { ResourceEmpty } from "@/components/resource-page";
import { restoreItems } from "@/lib/actions";
import { listThreads, type MailListRow } from "@/lib/api";

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

export function ScheduledPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/scheduled" });
  return <ScheduledView orgSlug={orgSlug} />;
}

export function TrashPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/trash" });
  return <MailFolderList orgSlug={orgSlug} folder="trash" title="Trash" />;
}

export function SentPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/sent" });
  return <MailFolderList orgSlug={orgSlug} folder="sent" title="Sent" />;
}

const EMPTY: Record<"sent" | "trash", string> = {
  sent: "Nothing sent yet",
  trash: "Trash is empty",
};

function MailFolderList({
  orgSlug,
  folder,
  title,
}: {
  orgSlug: string;
  folder: "sent" | "trash";
  title: string;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 250);

  const list = useInfiniteQuery({
    queryKey: ["threads", orgSlug, folder, debounced],
    queryFn: ({ pageParam }) =>
      listThreads({
        orgSlug,
        folder,
        q: debounced.trim() || undefined,
        cursor: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  const restore = useMutation({
    mutationFn: (row: MailListRow) =>
      restoreItems(
        orgSlug,
        row.kind === "email" ? { emailIds: [row.id] } : { threadIds: [row.id] },
      ),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["threads", orgSlug] });
    },
    onError: () => setError("Could not restore."),
  });

  const emptyLabel = debounced.trim()
    ? `No results for “${debounced.trim()}”`
    : EMPTY[folder];

  return (
    <section className="grid gap-3">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-ink-muted">Mail in this folder.</p>
      </header>

      <label className="relative max-w-md">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-muted"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
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

      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      {list.isPending ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : list.isError ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          Could not load {title.toLowerCase()}.
        </p>
      ) : rows.length === 0 ? (
        <ResourceEmpty mood={folder === "trash" ? "idle" : "happy"}>{emptyLabel}</ResourceEmpty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <ul>
            {rows.map((row) => (
              <ThreadRow
                key={rowKey(row)}
                row={row}
                orgSlug={orgSlug}
                folder={folder}
                onRestore={folder === "trash" ? () => restore.mutate(row) : undefined}
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
