import { ChartLine, Inbox, MailCheck, PlugZap } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Greeting } from "./greeting";
import { KpiCard, type KpiTone } from "./kpi-card";
import type { Overview } from "./overview-model";

const tones: Record<string, KpiTone> = {
  sent: "accent",
  delivered: "success",
  opened: "engaged",
  bounced: "danger",
};

const unlocks = [
  { icon: MailCheck, title: "Read receipts", body: "See when a reply is delivered and opened." },
  {
    icon: ChartLine,
    title: "Delivery insights",
    body: "Bounce, open and delivery rates with trends.",
  },
  {
    icon: Inbox,
    title: "A shared inbox",
    body: "Replies land in threads your team can work through.",
  },
];

/** Overview dashboard body: greeting, KPI tiles and the next concrete step. */
export function OverviewContent({
  orgSlug,
  overview,
  userName,
}: {
  orgSlug: string;
  overview: Overview;
  userName?: string;
}) {
  return (
    <>
      <Greeting name={userName}>{overview.summary}</Greeting>

      <section aria-label={`Email health, ${overview.periodLabel.toLowerCase()}`}>
        <ul className="grid grid-cols-2 gap-3 min-[1000px]:grid-cols-4">
          {overview.kpis.map((kpi) => (
            <li key={kpi.key} className="min-w-0">
              <KpiCard
                label={kpi.label}
                value={kpi.value}
                unit={kpi.unit}
                delta={kpi.delta}
                series={kpi.series}
                tone={tones[kpi.key]}
                summary={`${kpi.label}: ${kpi.value}${kpi.unit === "percent" ? "%" : ""}, ${overview.periodLabel.toLowerCase()}`}
                className="h-full"
              />
            </li>
          ))}
        </ul>
      </section>

      {!overview.hasConnection ? (
        <section
          aria-labelledby="connect-title"
          className="grid gap-6 rounded-xl bg-surface p-5 shadow-glow min-[760px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[760px]:p-6"
        >
          <div className="grid content-start gap-3">
            <span className="grid size-10 place-items-center rounded-md bg-accent-soft text-accent">
              <PlugZap aria-hidden className="size-5" />
            </span>
            <h2 id="connect-title" className="text-xl leading-7 font-semibold tracking-[-0.01em]">
              Connect your first Resend account
            </h2>
            <p className="max-w-[46ch] text-ink-muted">
              Paste a Full access API key and Wisemail syncs your domains, emails and events. It
              takes about a minute.
            </p>
            <div className="pt-1">
              <Button asChild size="lg" className="h-10 rounded-md px-5 font-bold">
                <Link href={`/${orgSlug}/settings/connections`}>Connect account</Link>
              </Button>
            </div>
          </div>
          <div className="grid content-start gap-2.5">
            <span className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
              What it unlocks
            </span>
            <ul className="grid gap-2">
              {unlocks.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3 rounded-md bg-canvas p-3">
                  <Icon aria-hidden className="mt-0.5 size-[18px] shrink-0 text-engaged" />
                  <span className="grid text-[0.8125rem] leading-snug">
                    <b className="font-semibold">{title}</b>
                    <span className="text-ink-muted">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}
