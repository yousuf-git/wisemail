import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { getAdminOverview } from "@/lib/admin-api";

const nf = new Intl.NumberFormat("en-US");

export function AdminOverviewPage() {
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: getAdminOverview });

  if (overview.isPending) return <p className="text-sm text-ink-muted">Loading overview…</p>;
  if (overview.isError || !overview.data) {
    return <p className="text-sm text-danger-ink">Could not load overview.</p>;
  }

  const o = overview.data;
  const c = o.counts;
  const total = o.plans.reduce((n, p) => n + p.count, 0) || 1;

  return (
    <>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-ink-muted">Everything across all workspaces, right now.</p>
      </header>
      <div className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-4">
        <Stat label="Users" value={nf.format(c.users)} hint={`${c.signupsLast7d} new in 7 days`} to="/admin/users" />
        <Stat
          label="Organizations"
          value={nf.format(c.organizations)}
          hint={o.suspended ? `${o.suspended} suspended` : undefined}
          to="/admin/organizations"
        />
        <Stat label="Active connections" value={nf.format(c.activeConnections)} />
        <Stat
          label="Needs attention"
          value={nf.format(c.needsAttentionConnections)}
          warn={c.needsAttentionConnections > 0}
          to="/admin/health"
        />
        <Stat label="Events, last 24h" value={nf.format(c.eventsLast24h)} />
        <Stat
          label="Failed events"
          value={nf.format(c.failedEvents24h)}
          warn={c.failedEvents24h > 0}
          to="/admin/health"
        />
        <Stat
          label="Failed syncs"
          value={nf.format(c.failedSyncRuns24h)}
          warn={c.failedSyncRuns24h > 0}
          to="/admin/health"
        />
        <Stat label="On a trial" value={nf.format(o.trialing)} />
      </div>

      <section className="grid gap-3 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Plans</h2>
        <ul className="grid gap-3">
          {o.plans.map((p) => (
            <li key={p.plan} className="grid gap-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{p.label}</span>
                <span className="tabular-nums text-ink-muted">{nf.format(p.count)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-canvas-sunken">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.max(2, (p.count / total) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-2 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Recent sign-ups</h2>
          <Link to="/admin/users" className="text-sm font-medium text-accent-fill hover:underline">
            All users
          </Link>
        </div>
        {o.recentSignups.length === 0 ? (
          <p className="text-sm text-ink-muted">No users yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {o.recentSignups.map((u) => (
              <li key={u.id}>
                <Link
                  to="/admin/users/$userId"
                  params={{ userId: u.id }}
                  className="flex justify-between gap-3 py-2 text-sm hover:bg-canvas-sunken"
                >
                  <span className="truncate font-medium">{u.name || u.email}</span>
                  <time className="shrink-0 text-xs text-ink-faint">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  to,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  to?: "/admin/users" | "/admin/organizations" | "/admin/health";
  warn?: boolean;
}) {
  const body = (
    <>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${warn ? "text-warning-ink" : ""}`}>
        {value}
      </p>
      {hint ? <p className="text-xs text-ink-faint">{hint}</p> : null}
    </>
  );
  const className = "rounded-xl border border-line bg-surface p-3";
  if (to) {
    return (
      <Link to={to} className={`${className} transition-colors hover:border-accent`}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}
