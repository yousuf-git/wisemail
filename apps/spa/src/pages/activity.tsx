import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { listActivity } from "@/lib/api";

export function ActivityPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/activity" });
  const activity = useQuery({
    queryKey: ["activity", orgSlug],
    queryFn: () => listActivity(orgSlug),
  });

  return (
    <section className="grid gap-3">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-ink-muted">`GET /api/v1/activity`</p>
      </header>
      {activity.isPending ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : activity.isError ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          Could not load activity.
        </p>
      ) : activity.data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-muted">
          No activity yet.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {activity.data.items.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.subject || "(no subject)"}</p>
                <p className="truncate text-xs text-ink-muted">
                  {row.direction} · {row.status}
                </p>
              </div>
              <time className="shrink-0 text-xs text-ink-faint">
                {new Date(row.at).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}