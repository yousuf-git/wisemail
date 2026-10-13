import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { listThreads } from "@/lib/api";

export function ScheduledPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/scheduled" });
  return <MailFolderList orgSlug={orgSlug} folder="scheduled" title="Scheduled" />;
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
  const threads = useQuery({
    queryKey: ["threads", orgSlug, folder],
    queryFn: () => listThreads(orgSlug, folder),
  });

  return (
    <section className="grid gap-3">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-ink-muted">`GET /api/v1/threads?folder={folder}`</p>
      </header>
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
