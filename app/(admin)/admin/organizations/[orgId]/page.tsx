import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import {
  ConnectionChip,
  Empty,
  KeyValue,
  Panel,
  PlanChip,
  Row,
  RowList,
  formatDate,
  formatDateTime,
  formatNumber,
} from "@/components/admin/admin-ui";
import { LimitsForm, PlanForm, SuspendForm, TrialForm } from "@/components/admin/org-actions";
import { PageHeader } from "@/components/app/page-header";
import { StatusChip } from "@/components/app/status-chip";
import { requirePlatformAdmin } from "@/lib/admin/guard";
import { getOrgDetail } from "@/lib/services/admin/orgs";

export const metadata: Metadata = { title: "Organization" };

export default async function AdminOrgPage({ params }: PageProps<"/admin/organizations/[orgId]">) {
  await requirePlatformAdmin();
  const { orgId } = await params;
  const org = await getOrgDetail(orgId);
  if (!org) notFound();
  const u = org.usage;
  const pct = Math.min(100, Math.round((u.tracked.total / Math.max(1, u.allowance)) * 100));
  return (
    <>
      <PageHeader
        title={org.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            /{org.slug}
            <PlanChip plan={org.plan} label={org.planState === "trialing" ? `${org.planLabel} trial` : org.planLabel} />
            {org.suspended ? <StatusChip state="danger">Suspended</StatusChip> : null}
          </span>
        }
        actions={
          <Link href="/admin/organizations" className="text-sm font-medium text-accent-fill hover:underline">
            All organizations
          </Link>
        }
      />
      {org.suspended ? (
        <p role="status" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger-ink">
          Suspended on {formatDate(org.suspended.at)}
          {org.suspended.by ? ` by ${org.suspended.by}` : ""}: {org.suspended.reason}
        </p>
      ) : null}

      <div className="grid gap-3.5 min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="grid min-w-0 content-start gap-3.5">
          <Panel title="Usage this period" description={`${formatDate(u.periodStart)} to ${formatDate(u.periodEnd)}`}>
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between text-sm">
                <span>
                  <strong className="tabular-nums">{formatNumber(u.tracked.total)}</strong> tracked of{" "}
                  {formatNumber(u.allowance)}
                </span>
                <span className="text-ink-muted tabular-nums">{pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-canvas-sunken" aria-hidden>
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, u.tracked.total ? 2 : 0)}%` }} />
              </div>
              <p className="text-xs text-ink-muted">
                {formatNumber(u.tracked.transactional)} transactional · {formatNumber(u.tracked.broadcast)} broadcast ·{" "}
                {formatNumber(u.tracked.inbound)} inbound
              </p>
            </div>
          </Panel>

          <Panel title="Connections">
            {org.connections.length === 0 ? (
              <Empty>No Resend connections.</Empty>
            ) : (
              <RowList>
                {org.connections.map((c) => (
                  <Row key={c.id} aside={<ConnectionChip status={c.status} />}>
                    <p className="truncate text-sm font-semibold">
                      {c.name} {c.apiKeyLast4 ? <span className="font-normal text-ink-muted">···{c.apiKeyLast4}</span> : null}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {c.statusReason ? `${c.statusReason} · ` : ""}last event {formatDateTime(c.lastEventAt)} · last sync{" "}
                      {formatDateTime(c.lastSyncAt)}
                    </p>
                  </Row>
                ))}
              </RowList>
            )}
          </Panel>

          <Panel title="Members">
            <RowList>
              {org.members.map((m) => (
                <Row key={m.userId} href={`/admin/users/${m.userId}`} aside={<StatusChip state="info">{m.role}</StatusChip>}>
                  <p className="truncate text-sm font-semibold">{m.name || m.email}</p>
                  <p className="truncate text-xs text-ink-muted">{m.email}</p>
                </Row>
              ))}
            </RowList>
          </Panel>

          <Panel title="Recent admin activity" description="Platform-admin changes to this workspace.">
            {org.recentAudit.length === 0 ? (
              <Empty>Nothing yet.</Empty>
            ) : (
              <RowList>
                {org.recentAudit.map((a) => (
                  <Row key={a.id} aside={<span className="text-xs text-ink-muted">{formatDateTime(a.at)}</span>}>
                    <p className="text-sm font-semibold">
                      <code className="font-mono text-[0.8rem]">{a.action}</code>{" "}
                      <span className="font-normal text-ink-muted">by {a.actor}</span>
                    </p>
                    {a.reason ? <p className="text-xs text-ink-muted">{a.reason}</p> : null}
                  </Row>
                ))}
              </RowList>
            )}
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-3.5">
          <Panel title="Plan">
            <KeyValue
              items={[
                { label: "Plan in effect", value: org.planLabel },
                { label: "State", value: org.planState },
                ...(org.trial
                  ? [{ label: "Trial ends", value: `${formatDate(org.trial.endsAt)}${org.trial.active ? ` (${org.trial.daysLeft} days left)` : " (ended)"}` }]
                  : []),
              ]}
            />
            <div className="mt-4">
              <PlanForm orgId={org.id} plan={org.storedPlan} billingEnabled={org.billingEnabled} />
            </div>
          </Panel>
          <Panel title="Trial">
            <TrialForm orgId={org.id} running={!!org.trial?.active} />
          </Panel>
          <Panel title="Limit overrides" description="Exceptions on top of the plan, for sales deals and support.">
            <LimitsForm orgId={org.id} limits={org.limits} />
          </Panel>
          <Panel title="Suspension">
            <SuspendForm orgId={org.id} suspended={!!org.suspended} />
          </Panel>
        </div>
      </div>
    </>
  );
}
