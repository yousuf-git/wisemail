import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { listThreads } from "@/lib/api";

export function InboxPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/inbox" });
  const threads = useQuery({
    queryKey: ["threads", orgSlug, "inbox"],
    queryFn: () => listThreads(orgSlug, "inbox"),
  });

  return (
    <section className="grid gap-3">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-ink-muted">
          Live list from `GET /api/v1/threads` (TanStack Query).
        </p>
      </header>
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
            return (
              <li key={row.id} className="grid gap-0.5 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className={`truncate text-sm ${row.unread ? "font-semibold" : "font-medium"}`}>
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
