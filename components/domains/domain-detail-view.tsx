"use client";

import { ArrowLeft, RefreshCw, ScanSearch, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { checkDnsAction, verifyDomainAction } from "@/app/(app)/[orgSlug]/domains/actions";
import { PageHeader } from "@/components/app/page-header";
import { StatusChip } from "@/components/app/status-chip";
import { friendlyError } from "@/components/composer/errors";
import { Button } from "@/components/ui/button";
import type { DnsCheckDTO, DomainDTO } from "@/lib/dto/domain";
import { timeAgo } from "@/components/connections/status";
import { DeleteDomainDialog } from "./delete-domain-dialog";
import { ProjectSelect, TrackingSwitch, type ProjectChoice } from "./domain-controls";
import { CHECK_LABELS, domainStatus, shortDate, VERDICT } from "./domain-status";
import { DnsRecords } from "./dns-records";
import type { DomainPermissions } from "./domains-view";

export type DomainDetailPermissions = DomainPermissions & { verify: boolean; delete: boolean };

function DnsCheckPanel({ check }: { check: DnsCheckDTO | null }) {
  if (!check) {
    return (
      <p className="text-sm text-ink-muted">
        Not checked yet. Wisemail checks DNS every day; press &ldquo;Check DNS now&rdquo; to run it
        now.
      </p>
    );
  }
  return (
    <div className="grid gap-3">
      <ul className="flex flex-wrap gap-2" aria-label="DNS check summary">
        {(["spf", "dkim", "dmarc", "mx"] as const).map((key) => {
          const verdict = VERDICT[check[key]];
          return (
            <li key={key} data-testid={`dns-${key}`} data-verdict={check[key]}>
              <StatusChip state={verdict.state}>
                {CHECK_LABELS[key]}: {verdict.label}
              </StatusChip>
            </li>
          );
        })}
      </ul>
      <ul className="grid gap-1.5 text-[0.8125rem] text-ink-secondary">
        {check.details.map((d, i) => (
          <li key={`${d.group}-${d.name}-${i}`} className="flex gap-2">
            <span
              aria-hidden
              className={
                d.verdict === "pass"
                  ? "mt-1.5 size-1.5 shrink-0 rounded-full bg-success"
                  : d.verdict === "fail" || d.verdict === "missing"
                    ? "mt-1.5 size-1.5 shrink-0 rounded-full bg-danger"
                    : "mt-1.5 size-1.5 shrink-0 rounded-full bg-neutral"
              }
            />
            <span className="min-w-0 break-words">{d.message}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-muted" suppressHydrationWarning>
        Checked {timeAgo(check.checkedAt)}
      </p>
    </div>
  );
}

export function DomainDetailView({
  orgSlug,
  domain,
  projects,
  can,
}: {
  orgSlug: string;
  domain: DomainDTO;
  projects: ProjectChoice[];
  can: DomainDetailPermissions;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"verify" | "check" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const status = domainStatus(domain.status);

  async function verify() {
    setBusy("verify");
    const result = await verifyDomainAction(orgSlug, { domainId: domain.id });
    setBusy(null);
    if (!result.ok) return void toast.error(friendlyError(result.error).message);
    if (result.data.status === "verified") toast.success(`${domain.name} is verified`);
    else
      toast.info(
        `${domain.name} is ${domainStatus(result.data.status).label.toLowerCase()}. DNS changes can take a while; try again soon.`,
      );
    router.refresh();
  }

  async function check() {
    setBusy("check");
    const result = await checkDnsAction(orgSlug, { domainId: domain.id });
    setBusy(null);
    if (!result.ok) return void toast.error(friendlyError(result.error).message);
    toast.success("DNS checked");
    router.refresh();
  }

  return (
    <>
      <Link
        href={`/${orgSlug}/domains`}
        className="inline-flex w-fit items-center gap-1.5 rounded-sm text-[0.8125rem] font-medium text-ink-secondary outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ArrowLeft aria-hidden className="size-4" />
        All domains
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 break-all">{domain.name}</span>
            <StatusChip state={status.state}>{status.label}</StatusChip>
          </span>
        }
        description={`${domain.connectionName} · ${domain.region ?? "region unknown"} · added ${shortDate(domain.createdAt)}`}
        actions={
          <>
            {can.verify ? (
              <Button variant="outline" onClick={verify} disabled={busy !== null}>
                <RefreshCw aria-hidden className={busy === "verify" ? "animate-spin" : undefined} />
                {busy === "verify" ? "Verifying…" : "Verify now"}
              </Button>
            ) : null}
            {can.update ? (
              <Button variant="outline" onClick={check} disabled={busy !== null}>
                <ScanSearch aria-hidden />
                {busy === "check" ? "Checking…" : "Check DNS now"}
              </Button>
            ) : null}
            {can.delete ? (
              <Button variant="outline" onClick={() => setDeleting(true)}>
                <Trash2 aria-hidden /> Delete
              </Button>
            ) : null}
          </>
        }
      />

      <section
        aria-labelledby="settings-heading"
        className="grid gap-4 rounded-xl bg-surface p-4 shadow-md min-[560px]:p-5"
      >
        <h2 id="settings-heading" className="text-base font-semibold">
          Settings
        </h2>
        <div className="grid gap-4 min-[720px]:grid-cols-2">
          <label className="flex items-start justify-between gap-4">
            <span className="grid gap-0.5">
              <span className="text-sm font-semibold">Open tracking</span>
              <span className="text-[0.8125rem] text-ink-muted">
                Adds a tiny image to measure opens. Counts are estimates.
              </span>
            </span>
            <TrackingSwitch orgSlug={orgSlug} domain={domain} kind="open" disabled={!can.update} />
          </label>
          <label className="flex items-start justify-between gap-4">
            <span className="grid gap-0.5">
              <span className="text-sm font-semibold">Click tracking</span>
              <span className="text-[0.8125rem] text-ink-muted">
                Rewrites links so clicks can be counted.
              </span>
            </span>
            <TrackingSwitch orgSlug={orgSlug} domain={domain} kind="click" disabled={!can.update} />
          </label>
          <div className="grid gap-1">
            <span className="text-sm font-semibold">Receiving</span>
            <span className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-muted">
              <StatusChip
                state={
                  domain.receivingEnabled
                    ? domain.receivingVerified
                      ? "success"
                      : "warning"
                    : "neutral"
                }
              >
                {domain.receivingEnabled
                  ? domain.receivingVerified
                    ? "On"
                    : "On, MX not verified"
                  : "Off"}
              </StatusChip>
              Receiving is turned on in Resend and needs an MX record.
            </span>
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-semibold">Project</span>
            <ProjectSelect
              orgSlug={orgSlug}
              domain={domain}
              projects={projects}
              disabled={!can.assignProject || projects.length === 0}
              className="max-w-64"
            />
          </div>
        </div>
        {domain.senderCount > 0 ? (
          <p className="text-[0.8125rem] text-ink-muted">
            {domain.senderCount} {domain.senderCount === 1 ? "sender uses" : "senders use"} this
            domain.{" "}
            <Link href={`/${orgSlug}/settings/senders`} className="font-medium text-ink underline">
              Manage senders
            </Link>
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="records-heading"
        className="grid gap-3 rounded-xl bg-surface p-4 shadow-md min-[560px]:p-5"
      >
        <div>
          <h2 id="records-heading" className="text-base font-semibold">
            DNS records
          </h2>
          <p className="text-[0.8125rem] text-ink-muted">
            Create these at your DNS provider. &ldquo;Verify now&rdquo; asks Resend to look again.
          </p>
        </div>
        <DnsRecords records={domain.records} />
      </section>

      <section
        aria-labelledby="check-heading"
        className="grid gap-3 rounded-xl bg-surface p-4 shadow-md min-[560px]:p-5"
      >
        <div>
          <h2 id="check-heading" className="text-base font-semibold">
            DNS check
          </h2>
          <p className="text-[0.8125rem] text-ink-muted">
            Wisemail looks up SPF, DKIM, DMARC and MX itself every day and warns you if they
            disappear.
          </p>
        </div>
        <DnsCheckPanel check={domain.dnsCheck} />
      </section>

      {can.delete && deleting ? (
        <DeleteDomainDialog
          orgSlug={orgSlug}
          domain={domain}
          open
          onOpenChange={(open) => !open && setDeleting(false)}
          redirectTo={`/${orgSlug}/domains`}
        />
      ) : null}
    </>
  );
}
