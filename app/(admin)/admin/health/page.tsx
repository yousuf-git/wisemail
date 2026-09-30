import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

import {
  ConnectionChip,
  Empty,
  Panel,
  Row,
  RowList,
  Stat,
  formatDateTime,
} from "@/components/admin/admin-ui";
import { PageHeader } from "@/components/app/page-header";
import { requirePlatformAdmin } from "@/lib/admin/guard";
import { getSystemHealth } from "@/lib/services/admin/health";

export const metadata: Metadata = { title: "System health" };

const nf = new Intl.NumberFormat("en-US");
const ms = (v: number | null) => (v === null ? "n/a" : v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`);

export default async function AdminHealthPage() {
  await requirePlatformAdmin();
  const h = await getSystemHealth();
  const i = h.ingest;
  return (
    <>
      <PageHeader
        title="System health"
        description="Read-only view of connections, syncs and webhook processing across tenants."
        actions={
          <a
            href={h.inngestUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium outline-none hover:bg-canvas-sunken focus-visible:ring-2 focus-visible:ring-accent"
          >
            {h.inngestDev ? "Inngest dev server" : "Inngest dashboard"}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        }
      />
      <div className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-4">
        <Stat label="Events, last hour" value={nf.format(i.eventsLastHour)} />
        <Stat label="Events, last 24h" value={nf.format(i.eventsLast24h)} />
        <Stat
          label="Processing failures"
          value={nf.format(i.failedLast24h)}
          tone={i.failedLast24h ? "danger" : undefined}
          hint="last 24h"
        />
        <Stat
          label="Unprocessed backlog"
          value={nf.format(i.backlog)}
          tone={i.backlog ? "warning" : undefined}
          hint="older than 5 min"
        />
      </div>
      <Panel
        title="Webhook processing time"
        description="From ingest to processed, events of the last 24 hours."
      >
        <p className="text-sm">
          Average <strong>{ms(i.avgProcessingMs)}</strong> · slowest <strong>{ms(i.maxProcessingMs)}</strong>
        </p>
      </Panel>

      <Panel title="Connections needing attention" description="Needs attention or stuck provisioning.">
        {h.attention.length === 0 ? (
          <Empty>Every connection is healthy.</Empty>
        ) : (
          <RowList>
            {h.attention.map((c) => (
              <Row key={c.id} href={`/admin/organizations/${c.orgId}`} aside={<ConnectionChip status={c.status} />}>
                <p className="truncate text-sm font-semibold">
                  {c.name} <span className="font-normal text-ink-muted">in {c.orgName}</span>
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {c.statusReason ?? "no reason recorded"} · last event {formatDateTime(c.lastEventAt)}
                </p>
              </Row>
            ))}
          </RowList>
        )}
      </Panel>

      <Panel title="Failed sync runs" description="Last 24 hours.">
        {h.failedSyncs.length === 0 ? (
          <Empty>No failed syncs.</Empty>
        ) : (
          <RowList>
            {h.failedSyncs.map((r) => (
              <Row key={r.id} href={`/admin/organizations/${r.orgId}`} aside={<span className="text-xs text-ink-muted">{formatDateTime(r.startedAt)}</span>}>
                <p className="truncate text-sm font-semibold">
                  {r.connectionName} <span className="font-normal text-ink-muted">in {r.orgName}</span>
                </p>
                <p className="text-xs text-ink-muted">
                  {r.stage ? `Stage ${r.stage}: ` : ""}
                  {r.error ?? "no error recorded"}
                </p>
              </Row>
            ))}
          </RowList>
        )}
      </Panel>

      <Panel title="Webhook events that failed processing" description="Last 24 hours, newest first.">
        {h.failedEvents.length === 0 ? (
          <Empty>No failed events.</Empty>
        ) : (
          <RowList>
            {h.failedEvents.map((e) => (
              <Row key={e.id} href={`/admin/organizations/${e.orgId}`} aside={<span className="text-xs text-ink-muted">{formatDateTime(e.receivedAt)}</span>}>
                <p className="truncate text-sm font-semibold">
                  <code className="font-mono text-[0.8rem]">{e.type}</code>{" "}
                  <span className="font-normal text-ink-muted">in {e.orgName}</span>
                </p>
                <p className="text-xs break-words text-ink-muted">{e.error}</p>
              </Row>
            ))}
          </RowList>
        )}
      </Panel>
      <p className="text-xs text-ink-muted">
        Generated {formatDateTime(h.generatedAt)}. <Link href="/admin/health" className="underline">Refresh</Link>
      </p>
    </>
  );
}
