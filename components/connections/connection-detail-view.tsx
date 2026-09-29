"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { StatusChip } from "@/components/app/status-chip";
import { Wizi } from "@/components/mascot/wizi";
import { summarizeChecklist, type ConnectionDetailDTO } from "@/lib/dto/checklist";
import { STATUS_REASON_COPY } from "@/lib/dto/connection";
import type { ConnectionStatus } from "@/lib/db/models/connections";
import { Checklist } from "./checklist";
import { CONNECTION_STATUS } from "./status";
import { SyncStatus } from "./sync-status";

const COUNT_LABELS: [keyof ConnectionDetailDTO["counts"], string][] = [
  ["domains", "Domains"],
  ["apiKeys", "API keys"],
  ["contacts", "Contacts"],
  ["segments", "Segments"],
  ["topics", "Topics"],
  ["contactProperties", "Contact properties"],
  ["templates", "Templates"],
  ["broadcasts", "Broadcasts"],
  ["automations", "Automations"],
];

export function ConnectionDetailView({
  orgSlug,
  connection,
  can,
}: {
  orgSlug: string;
  connection: ConnectionDetailDTO;
  can: { update: boolean; domainUpdate: boolean };
}) {
  const status = CONNECTION_STATUS[connection.status as ConnectionStatus];
  const summary = summarizeChecklist(connection.checklist);
  const allReady = summary.total > 0 && summary.ok === summary.total;
  const reason = connection.statusReason ? STATUS_REASON_COPY[connection.statusReason] : null;
  const manageable = connection.status !== "read_only" && connection.status !== "disabled";

  return (
    <>
      <Link
        href={`/${orgSlug}/settings/connections`}
        className="inline-flex w-fit items-center gap-1.5 rounded-sm text-[0.8125rem] font-medium text-ink-secondary outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ArrowLeft aria-hidden className="size-4" />
        All connections
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {connection.name}
            {status ? <StatusChip state={status.state}>{status.label}</StatusChip> : null}
          </span>
        }
        description={`Key re_••••${connection.apiKeyLast4 ?? "••••"}`}
      />

      {reason ? (
        <p
          role="status"
          className="max-w-[68ch] rounded-md bg-warning-soft px-3 py-2.5 text-[0.8125rem] leading-snug text-warning-ink"
        >
          {reason}
        </p>
      ) : null}

      <section
        aria-labelledby="sync-heading"
        className="grid gap-3 rounded-xl bg-surface p-4 shadow-md min-[560px]:p-5"
      >
        <h2 id="sync-heading" className="text-base font-semibold">
          Sync
        </h2>
        <SyncStatus
          orgSlug={orgSlug}
          connectionId={connection.id}
          sync={connection.sync}
          lastSyncAt={connection.lastSyncAt}
          canSync={can.update && connection.status !== "disabled"}
        />
        {connection.sync ? (
          <ol
            className="grid gap-x-6 gap-y-1 text-[0.8125rem] text-ink-secondary min-[560px]:grid-cols-2"
            aria-label="Sync steps"
          >
            {connection.sync.progress.map((step) => (
              <li key={step.key} className="flex items-center justify-between gap-3">
                <span>{step.label}</span>
                <span className="text-ink-muted">
                  {step.status === "completed"
                    ? `${step.count} synced`
                    : step.status === "running"
                      ? `${step.count} so far`
                      : step.status === "failed"
                        ? "failed"
                        : "waiting"}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <section
        aria-labelledby="checklist-heading"
        className="grid gap-3 rounded-xl bg-surface p-4 shadow-md min-[560px]:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="checklist-heading" className="text-base font-semibold">
            Setup checklist
            {summary.total > 0 ? (
              <span className="ml-2 text-[0.8125rem] font-normal text-ink-muted">
                {summary.ok} of {summary.total} ready
              </span>
            ) : null}
          </h2>
          {allReady ? (
            <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-success-ink">
              <Wizi mood="happy" size={48} />
              All set. Nothing to fix here.
            </span>
          ) : null}
        </div>
        {connection.checklist.length > 0 ? (
          <Checklist
            orgSlug={orgSlug}
            connectionId={connection.id}
            items={connection.checklist}
            can={{ connection: can.update, domain: can.domainUpdate }}
            showDomains
            fixesDisabled={!manageable}
          />
        ) : (
          <p className="text-[0.8125rem] text-ink-muted">
            The checklist appears once the first sync has read this account&apos;s domains.
          </p>
        )}
      </section>

      <section
        aria-labelledby="counts-heading"
        className="grid gap-3 rounded-xl bg-surface p-4 shadow-md min-[560px]:p-5"
      >
        <h2 id="counts-heading" className="text-base font-semibold">
          Synced from Resend
        </h2>
        <dl className="grid grid-cols-2 gap-3 min-[640px]:grid-cols-3" data-testid="mirror-counts">
          {COUNT_LABELS.map(([key, label]) => (
            <div key={key} className="rounded-lg bg-canvas-sunken px-3 py-2.5">
              <dt className="text-xs text-ink-muted">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums" data-testid={`count-${key}`}>
                {connection.counts[key]}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {connection.domains.length > 0 ? (
        <section
          aria-labelledby="domains-heading"
          className="grid gap-3 rounded-xl bg-surface p-4 shadow-md min-[560px]:p-5"
        >
          <h2 id="domains-heading" className="text-base font-semibold">
            Domains
          </h2>
          <ul className="grid gap-3">
            {connection.domains.map((domain) => (
              <li key={domain.id} className="grid gap-2 rounded-lg bg-canvas-sunken px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[0.875rem] font-semibold">{domain.name}</span>
                  <StatusChip state={domain.status === "verified" ? "success" : "warning"}>
                    {domain.status.replace(/_/g, " ")}
                  </StatusChip>
                  <span className="text-xs text-ink-muted">
                    Read receipts {domain.openTracking ? "on" : "off"} · Clicks{" "}
                    {domain.clickTracking ? "on" : "off"} · Inbox{" "}
                    {domain.receiving ? "ready" : "off"}
                  </span>
                </div>
                {domain.records.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-xs">
                      <thead className="text-ink-muted">
                        <tr>
                          <th className="pr-3 pb-1 font-medium">Record</th>
                          <th className="pr-3 pb-1 font-medium">Type</th>
                          <th className="pr-3 pb-1 font-medium">Name</th>
                          <th className="pb-1 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {domain.records.map((r, i) => (
                          <tr key={`${r.record}-${r.type}-${i}`}>
                            <td className="py-0.5 pr-3">{r.record}</td>
                            <td className="py-0.5 pr-3">{r.type}</td>
                            <td className="py-0.5 pr-3 font-mono">{r.name}</td>
                            <td className="py-0.5">{r.status.replace(/_/g, " ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
