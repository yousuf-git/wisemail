import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";

import { restoreThreads } from "@/lib/actions";
import { listThreads } from "@/lib/api";

export function ScheduledPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/scheduled" });
  return <MailFolderList orgSlug={orgSlug} folder="scheduled" title="Scheduled" />;
}

export function TrashPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/trash" });
  return <MailFolderList orgSlug={orgSlug} folder="trash" title="Trash" />;
}

export function SentPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/sent" });
  return <MailFolderList orgSlug={orgSlug} folder="sent" title="Sent" />;
}

function MailFolderList({
  orgSlug,
  folder,
  title,
}: {
  orgSlug: string;
  folder: "scheduled" | "sent" | "trash";
  title: string;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const threads = useQuery({
    queryKey: ["threads", orgSlug, folder],
    queryFn: () => listThreads(orgSlug, folder),
  });

  const restore = useMutation({
    mutationFn: (threadId: string) => restoreThreads(orgSlug, [threadId]),
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

  return (
    <section className="grid gap-3">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-ink-muted">`GET /api/v1/threads?folder={folder}`</p>
      </header>
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      {threads.isPending ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : threads.isError ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          Could not load {title.toLowerCase()}.
        </p>
      ) : threads.data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-muted">
          Nothing here yet.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {threads.data.items.map((row) => {
            const who = row.peopleLabels?.[0] ?? row.people[0] ?? "Unknown";
            const threadId = row.kind === "thread" ? row.id : row.threadId;
            return (
              <li key={row.id} className="flex items-stretch">
                <div className="min-w-0 flex-1 grid gap-0.5 px-4 py-3">
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
                </div>
                {folder === "trash" && threadId ? (
                  <button
                    type="button"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(threadId)}
                    className="shrink-0 border-l border-line px-3 text-xs font-medium text-ink-secondary hover:bg-canvas-sunken disabled:opacity-50"
                  >
                    Restore
                  </button>
                ) : folder === "scheduled" && threadId ? (
                  <Link
                    to="/$orgSlug/inbox/$threadId"
                    params={{ orgSlug, threadId }}
                    className="flex shrink-0 items-center border-l border-line px-3 text-xs font-medium text-accent-fill hover:bg-canvas-sunken"
                  >
                    Open
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
