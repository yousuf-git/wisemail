import type { Metadata } from "next";
import Link from "next/link";

import { Empty, Panel, Row, RowList, Stat, formatDate } from "@/components/admin/admin-ui";
import { PageHeader } from "@/components/app/page-header";
import { StatusChip } from "@/components/app/status-chip";
import { requirePlatformAdmin } from "@/lib/admin/guard";
import { getOverview } from "@/lib/services/admin/overview";

export const metadata: Metadata = { title: "Overview" };

const nf = new Intl.NumberFormat("en-US");

export default async function AdminOverviewPage() {
  await requirePlatformAdmin();
  const o = await getOverview();
  const c = o.counts;
  const total = o.plans.reduce((n, p) => n + p.count, 0) || 1;
  return (
    <>
      <PageHeader title="Overview" description="Everything across all workspaces, right now." />
      <div className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-4">
        <Stat label="Users" value={nf.format(c.users)} hint={`${c.signupsLast7d} new in 7 days`} href="/admin/users" />
        <Stat label="Organizations" value={nf.format(c.organizations)} hint={o.suspended ? `${o.suspended} suspended` : undefined} href="/admin/organizations" />
        <Stat label="Active connections" value={nf.format(c.activeConnections)} />
        <Stat
          label="Needs attention"
          value={nf.format(c.needsAttentionConnections)}
          tone={c.needsAttentionConnections ? "warning" : undefined}
          hint="connections"
          href="/admin/health"
        />
        <Stat label="Events, last 24h" value={nf.format(c.eventsLast24h)} hint="webhooks ingested" />
        <Stat
          label="Failed events"
          value={nf.format(c.failedEvents24h)}
          tone={c.failedEvents24h ? "danger" : undefined}
          hint="last 24h"
          href="/admin/health"
        />
        <Stat
          label="Failed syncs"
          value={nf.format(c.failedSyncRuns24h)}
          tone={c.failedSyncRuns24h ? "danger" : undefined}
          hint="last 24h"
          href="/admin/health"
        />
        <Stat label="On a trial" value={nf.format(o.trialing)} hint="workspaces" />
      </div>

      <div className="grid gap-3.5 min-[1000px]:grid-cols-2">
        <Panel title="Plans" description="Workspaces by plan (trials count under their stored plan).">
          <ul className="grid gap-3">
            {o.plans.map((p) => (
              <li key={p.plan} className="grid gap-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{p.label}</span>
                  <span className="tabular-nums text-ink-muted">{nf.format(p.count)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-canvas-sunken" aria-hidden>
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (p.count / total) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Recent sign-ups"
          actions={
            <Link href="/admin/users" className="text-sm font-medium text-accent-fill hover:underline">
              All users
            </Link>
          }
        >
          {o.recentSignups.length === 0 ? (
            <Empty>No users yet.</Empty>
          ) : (
            <RowList>
              {o.recentSignups.map((u) => (
                <Row
                  key={u.id}
                  href={`/admin/users/${u.id}`}
                  aside={
                    <>
                      {u.banned ? <StatusChip state="danger">Banned</StatusChip> : null}
                      {u.emailVerified ? null : <StatusChip state="warning">Unverified</StatusChip>}
                      <span className="text-xs text-ink-muted">{formatDate(u.createdAt)}</span>
                    </>
                  }
                >
                  <p className="truncate text-sm font-semibold">{u.name || u.email}</p>
                  <p className="truncate text-xs text-ink-muted">{u.email}</p>
                </Row>
              ))}
            </RowList>
          )}
        </Panel>
      </div>
    </>
  );
}
