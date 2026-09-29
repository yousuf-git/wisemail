"use client";

import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { acknowledgeIncidentAction } from "@/app/(app)/[orgSlug]/alerts/actions";
import { absoluteTime, relativeTime, useNow } from "@/components/inbox/format";
import { Button } from "@/components/ui/button";
import { ALERT_KIND_INFO } from "@/lib/alerts/kinds";
import type { IncidentDTO } from "@/lib/dto/alert";
import { IncidentStatus } from "./incident-status";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-semibold tracking-[0.04em] text-ink-muted uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** One incident: what fired, the numbers behind it, sample emails, and Acknowledge. */
export function IncidentDetail({
  orgSlug,
  incident,
  canAcknowledge,
}: {
  orgSlug: string;
  incident: IncidentDTO;
  canAcknowledge: boolean;
}) {
  const router = useRouter();
  const now = useNow();
  const [pending, startTransition] = useTransition();
  const c = incident.context;
  const isRate = ["bounce_rate", "complaint_rate", "delivery_delay_rate"].includes(incident.kind);

  return (
    <div className="grid gap-4">
      <Button asChild variant="ghost" size="sm" className="justify-self-start">
        <Link href={`/${orgSlug}/alerts`}>
          <ArrowLeft aria-hidden /> All alerts
        </Link>
      </Button>

      <section className="grid gap-4 rounded-xl bg-surface p-5 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1
              className="text-[1.5rem] leading-8 font-bold tracking-[-0.02em]"
              data-testid="incident-title"
            >
              {incident.title}
            </h1>
            <p className="mt-1 max-w-[68ch] text-ink-muted">{incident.summary}</p>
          </div>
          <IncidentStatus status={incident.status} />
        </div>

        <dl className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Rule">
            {incident.ruleName}
            <span className="block text-[0.8125rem] text-ink-muted">
              {ALERT_KIND_INFO[incident.kind].label}
            </span>
          </Fact>
          <Fact label="Opened">
            <span suppressHydrationWarning>{now ? relativeTime(incident.openedAt, now) : ""}</span>
            <span className="block text-[0.8125rem] text-ink-muted" suppressHydrationWarning>
              {absoluteTime(incident.openedAt)}
            </span>
          </Fact>
          {isRate ? (
            <Fact label="Seen vs. limit">
              <span className="tabular-nums">
                {incident.observedValue}% of {c.volume ?? "?"} emails
              </span>
              <span className="block text-[0.8125rem] text-ink-muted">
                Alerts above {c.threshold}%
              </span>
            </Fact>
          ) : null}
          {incident.resolvedAt ? (
            <Fact label="Resolved">
              <span suppressHydrationWarning>{absoluteTime(incident.resolvedAt)}</span>
            </Fact>
          ) : null}
          {c.connectionName ? <Fact label="Connection">{c.connectionName}</Fact> : null}
          {c.domainName ? <Fact label="Domain">{c.domainName}</Fact> : null}
        </dl>

        {c.sampleEmailIds && c.sampleEmailIds.length > 0 ? (
          <div className="grid gap-2 border-t border-line pt-4">
            <h2 className="text-sm font-semibold">Recent examples</h2>
            <ul className="flex flex-wrap gap-2">
              {c.sampleEmailIds.map((id) => (
                <li key={id}>
                  <Link
                    href={`/${orgSlug}/activity/${id}`}
                    className="rounded-full bg-canvas-sunken px-3 py-1 font-mono text-xs text-ink-secondary hover:text-ink"
                  >
                    {id.slice(-8)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {incident.status === "open" && canAcknowledge ? (
          <div className="border-t border-line pt-4">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await acknowledgeIncidentAction(orgSlug, {
                    incidentId: incident.id,
                  });
                  if (!result.ok) toast.error(result.error.message);
                  else toast.success("Marked as seen");
                  router.refresh();
                })
              }
            >
              <Check aria-hidden /> I&apos;m on it
            </Button>
            <p className="mt-2 text-[0.8125rem] text-ink-muted">
              The incident stays open and closes by itself once the numbers look normal again.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
