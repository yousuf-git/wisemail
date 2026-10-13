import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";

import { trashThreads } from "@/lib/actions";
import { listThreads } from "@/lib/api";

export function InboxPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/inbox" });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const threads = useQuery({
    queryKey: ["threads", orgSlug, "inbox"],
    queryFn: () => listThreads(orgSlug, "inbox"),
  });

  const trash = useMutation({
    mutationFn: (threadId: string) => trashThreads(orgSlug, [threadId]),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["threads", orgSlug, "inbox"] });
    },
    onError: () => setError("Could not trash the thread."),
  });

  return (
    <section className="grid gap-3">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-ink-muted">
          Live list from `GET /api/v1/threads` (TanStack Query).
        </p>
      </header>
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      {threads.isPending ? (
        <p className="text-sm text-ink-muted">Loading threads…</p>
      ) : threads.isError ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          Could not load inbox. Sign in and confirm the API is up.
        </p>
      ) : threads.data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-muted">
          No messages yet.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {threads.data.items.map((row) => {
            const who = row.peopleLabels?.[0] ?? row.people[0] ?? "Unknown";
            const threadId = row.kind === "thread" ? row.id : row.threadId;
            return (
              <li key={row.id} className="flex items-stretch gap-0">
                {threadId ? (
                  <Link
                    to="/$orgSlug/inbox/$threadId"
                    params={{ orgSlug, threadId }}
                    className="min-w-0 flex-1 grid gap-0.5 px-4 py-3 hover:bg-canvas-sunken"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p
                        className={`truncate text-sm ${row.unread ? "font-semibold" : "font-medium"}`}
                      >
                        {who}
                      </p>
                      <time className="shrink-0 text-xs text-ink-faint">
                        {new Date(row.lastMessageAt).toLocaleString()}
                      </time>
                    </div>
                    <p className="truncate text-sm text-ink">{row.subject || "(no subject)"}</p>
                    {row.snippet ? (
                      <p className="truncate text-xs text-ink-muted">{row.snippet}</p>
                    ) : null}
                  </Link>
                ) : (
                  <div className="min-w-0 flex-1 grid gap-0.5 px-4 py-3">
                    <p className="truncate text-sm font-medium">{who}</p>
                    <p className="truncate text-sm text-ink">{row.subject || "(no subject)"}</p>
                  </div>
                )}
                {threadId ? (
                  <button
                    type="button"
                    title="Trash"
                    disabled={trash.isPending}
                    onClick={() => trash.mutate(threadId)}
                    className="shrink-0 border-l border-line px-3 text-xs font-medium text-ink-muted hover:bg-danger-soft hover:text-danger-ink disabled:opacity-50"
                  >
                    Trash
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
