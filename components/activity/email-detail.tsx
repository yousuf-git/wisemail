"use client";

import { ArrowLeft, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { StatusChip } from "@/components/app/status-chip";
import { absoluteTime, relativeTime, useNow } from "@/components/inbox/format";
import { Button } from "@/components/ui/button";
import type { EmailTimelineDTO } from "@/lib/dto/mail";
import { eventLabel, eventState, statusLabel, statusState } from "./status";

const ORIGIN: Record<string, string> = {
  app: "Sent from Wisemail",
  external: "Sent by your app",
  broadcast: "Broadcast",
};

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[11px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
        {label}
      </dt>
      <dd className="min-w-0 text-[13.5px] break-words">{children}</dd>
    </div>
  );
}

/**
 * One email: who and what, then the full timeline oldest first (relative and absolute time,
 * raw payload on demand). Events are stored webhooks, so history outlives Resend's retention.
 */
export function EmailDetail({
  orgSlug,
  timeline,
  connectionName,
  domainName,
  canOpenThread,
}: {
  orgSlug: string;
  timeline: EmailTimelineDTO;
  connectionName: string | null;
  domainName: string | null;
  canOpenThread: boolean;
}) {
  const now = useNow();
  const { email, entries } = timeline;
  const Arrow = email.direction === "outbound" ? ArrowUpRight : ArrowDownLeft;
  // Server render and hydration use UTC so times never mismatch; the browser then switches to local.
  const zone = now ? undefined : "UTC";

  return (
    <div className="grid gap-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-ink-muted">
          <Link href={`/${orgSlug}/activity`}>
            <ArrowLeft aria-hidden /> Activity
          </Link>
        </Button>
      </div>

      <section className="grid gap-4 rounded-xl bg-surface p-5 shadow-md" aria-label="Email">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl leading-7 font-bold tracking-[-0.01em] [text-wrap:balance]">
              {email.subject || "(no subject)"}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
              <Arrow aria-hidden className="size-3.5" />
              {email.direction === "outbound" ? "Sent" : "Received"} ·{" "}
              {ORIGIN[email.origin] ?? email.origin}
            </p>
          </div>
          <StatusChip state={statusState(email.status)}>{statusLabel(email.status)}</StatusChip>
        </div>

        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Meta label="From">
            {email.from.name ? `${email.from.name} <${email.from.address}>` : email.from.address}
          </Meta>
          <Meta label="To">{email.to.join(", ") || "(none)"}</Meta>
          <Meta label={email.direction === "outbound" ? "Sent" : "Received"}>
            <time dateTime={email.at}>{absoluteTime(email.at, zone)}</time>
          </Meta>
          <Meta label="Connection">{connectionName ?? "Unknown"}</Meta>
          {domainName ? <Meta label="Domain">{domainName}</Meta> : null}
          {email.direction === "outbound" ? (
            <Meta label="Engagement">
              {email.openCount} {email.openCount === 1 ? "open" : "opens"} · {email.clickCount}{" "}
              {email.clickCount === 1 ? "click" : "clicks"}
            </Meta>
          ) : null}
          {email.tags.length ? (
            <Meta label="Tags">
              <span className="flex flex-wrap gap-1.5">
                {email.tags.map((t) => (
                  <code
                    key={`${t.name}=${t.value}`}
                    className="rounded-sm bg-canvas-sunken px-1.5 py-0.5 font-mono text-xs"
                  >
                    {t.name}={t.value}
                  </code>
                ))}
              </span>
            </Meta>
          ) : null}
        </dl>

        {email.threadId && canOpenThread ? (
          <div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/${orgSlug}/inbox/${email.threadId}`}>Open conversation</Link>
            </Button>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl bg-surface p-5 shadow-md" aria-label="Timeline">
        <h2 className="text-base font-bold">Timeline</h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            No events recorded for this email yet. They appear here as Resend reports them.
          </p>
        ) : (
          <ol className="mt-3 grid" data-testid="timeline">
            {entries.map((entry, index) => (
              <li
                key={entry.id}
                data-testid="timeline-entry"
                className="relative grid gap-1.5 pb-4 pl-6 last:pb-0"
              >
                <span
                  aria-hidden
                  className="absolute top-1.5 left-0 size-2.5 rounded-full bg-current text-ink-faint"
                />
                {index < entries.length - 1 ? (
                  <span aria-hidden className="absolute top-4 bottom-0 left-[4.5px] w-px bg-line" />
                ) : null}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusChip state={eventState(entry.type)}>{eventLabel(entry.type)}</StatusChip>
                  <time
                    dateTime={entry.occurredAt}
                    title={absoluteTime(entry.occurredAt, zone)}
                    className="text-sm text-ink-muted"
                  >
                    {now ? `${relativeTime(entry.occurredAt, now)} · ` : ""}
                    {absoluteTime(entry.occurredAt, zone)}
                  </time>
                </div>
                <details className="group text-sm">
                  <summary className="w-fit cursor-pointer text-xs font-semibold text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
                    Raw payload
                  </summary>
                  <pre className="mt-1.5 max-h-72 overflow-auto rounded-md bg-canvas-sunken p-3 font-mono text-xs leading-5">
                    {JSON.stringify(entry.payload, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
