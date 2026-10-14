import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ChartLine, Inbox, MailCheck, PlugZap } from "lucide-react";

import { Wizi } from "@/components/mascot/wizi";
import { getOverview, type OverviewKpi } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

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

const tones: Record<string, string> = {
  sent: "text-accent-fill",
  delivered: "text-success-ink",
  opened: "text-engaged",
  bounced: "text-danger-ink",
};

function Sparkline({ series }: { series: number[] }) {
  if (series.length < 2) return null;
  const max = Math.max(...series, 1);
  const w = 64;
  const h = 24;
  const pts = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = h - (v / max) * (h - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} aria-hidden className="text-ink-faint">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={pts} />
    </svg>
  );
}

function KpiCard({ kpi }: { kpi: OverviewKpi }) {
  return (
    <div className="grid gap-1 rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{kpi.label}</p>
        <Sparkline series={kpi.series} />
      </div>
      <p className={cn("text-2xl font-semibold tracking-tight", tones[kpi.key])}>
        {kpi.unit === "percent" ? `${kpi.value}%` : kpi.value.toLocaleString()}
      </p>
      {kpi.delta ? (
        <p className="text-xs text-ink-muted">
          {kpi.delta.value > 0 ? "+" : ""}
          {kpi.delta.value}
          {kpi.delta.suffix ?? ""} vs prior
        </p>
      ) : null}
    </div>
  );
}

/** Org home: greeting, KPIs, connect card when no Resend account is linked. */
export function OverviewPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const session = authClient.useSession();
  const overview = useQuery({
    queryKey: ["overview", orgSlug],
    queryFn: () => getOverview(orgSlug),
    // Live SSE invalidates this; poll as a quiet fallback when the stream is down.
    refetchInterval: 60_000,
  });

  const firstName = (session.data?.user?.name ?? "there").split(" ")[0] || "there";
  const data = overview.data;
  const hasConnection = data?.hasConnection ?? false;

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-start gap-4">
        <Wizi
          mood={hasConnection ? "happy" : "idle"}
          size={64}
          title="Wizi"
        />
        <div className="grid min-w-0 flex-1 gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Hi, {firstName}</h1>
          <p className="text-sm text-ink-muted">
            {overview.isPending
              ? "Loading overview…"
              : (data?.summary ?? "Connect a Resend account to sync mail, domains, and events.")}
          </p>
        </div>
      </header>

      {data?.hasConnection && data.kpis.length > 0 ? (
        <section aria-label={`Email health, ${data.periodLabel.toLowerCase()}`}>
          <ul className="grid grid-cols-2 gap-3 min-[1000px]:grid-cols-4">
            {data.kpis.map((kpi) => (
              <li key={kpi.key} className="min-w-0">
                <KpiCard kpi={kpi} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!overview.isPending && !hasConnection ? (
        <section
          aria-labelledby="connect-title"
          data-tour="connect-card"
          className="grid gap-6 rounded-xl border border-line bg-surface p-5 shadow-sm min-[760px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[760px]:p-6"
        >
          <div className="grid content-start gap-3">
            <span className="grid size-10 place-items-center rounded-md bg-accent-soft text-accent-fill">
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
              <Link
                to="/$orgSlug/settings/connections"
                params={{ orgSlug }}
                className="inline-flex h-10 items-center rounded-control bg-accent-fill px-5 text-sm font-bold text-accent-ink hover:bg-accent-fill-hover"
              >
                Connect account
              </Link>
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

      {hasConnection ? (
        <div className="flex flex-wrap gap-3">
          <Link
            to="/$orgSlug/settings/connections"
            params={{ orgSlug }}
            data-tour="checklist"
            className="inline-flex h-9 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas-sunken"
          >
            Setup checklist
          </Link>
          <Link
            to="/$orgSlug/inbox"
            params={{ orgSlug }}
            className="inline-flex h-9 items-center rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover"
          >
            Open inbox
          </Link>
          <Link
            to="/$orgSlug/compose"
            params={{ orgSlug }}
            className="inline-flex h-9 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas-sunken"
          >
            Compose
          </Link>
        </div>
      ) : null}
    </section>
  );
}
