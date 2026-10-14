import { Link, useSearch } from "@tanstack/react-router";

import { AppShell } from "@/components/shell/app-shell";
import { Wizi, wiziMoods } from "@/components/mascot/wizi";
import { cn } from "@/lib/utils";

/** Dev-only visual harness for the app shell with mock data. */

const demoKpis = [
  {
    key: "sent",
    label: "Sent",
    value: 12480,
    unit: "count" as const,
    delta: { value: 8, goodWhen: "up" as const, suffix: "%" },
    series: [9.2, 10.1, 9.8, 11, 10.6, 11.8, 12, 12.48],
  },
  {
    key: "delivered",
    label: "Delivered",
    value: 98.6,
    unit: "percent" as const,
    delta: { value: 0.4, goodWhen: "up" as const },
    series: [97.8, 98.1, 97.9, 98.3, 98.2, 98.5, 98.4, 98.6],
  },
  {
    key: "opened",
    label: "Opened (est.)",
    value: 41.2,
    unit: "percent" as const,
    delta: { value: 2.1, goodWhen: "up" as const },
    series: [36, 38, 37, 39, 40, 39, 41, 41.2],
  },
  {
    key: "bounced",
    label: "Bounced",
    value: 1.1,
    unit: "percent" as const,
    delta: { value: -0.3, goodWhen: "down" as const },
    series: [1.6, 1.5, 1.4, 1.5, 1.3, 1.2, 1.2, 1.1],
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

function PreviewOverview({ empty }: { empty: boolean }) {
  const summary = empty
    ? "Nothing to report yet. Let's connect your first Resend account and I'll keep watch."
    : "In the last 7 days: 12,480 emails sent, 98.6% delivered. Nothing needs your attention.";
  const kpis = empty
    ? demoKpis.map((k) => ({ ...k, value: 0, delta: null as null, series: [] as number[] }))
    : demoKpis;

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-start gap-4">
        <Wizi mood={empty ? "idle" : "happy"} size={64} title="Wizi" />
        <div className="grid min-w-0 flex-1 gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Hi, Sam</h1>
          <p className="text-sm text-ink-muted">{summary}</p>
        </div>
      </header>
      {!empty ? (
        <ul className="grid grid-cols-2 gap-3 min-[1000px]:grid-cols-4">
          {kpis.map((kpi) => (
            <li key={kpi.key} className="grid gap-1 rounded-xl border border-line bg-surface p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                  {kpi.label}
                </p>
                <Sparkline series={kpi.series} />
              </div>
              <p className={cn("text-2xl font-semibold tracking-tight", tones[kpi.key])}>
                {kpi.unit === "percent" ? `${kpi.value}%` : kpi.value.toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-surface p-6 text-sm text-ink-muted shadow-md">
          Connect a Resend account to populate this preview.
        </p>
      )}
    </section>
  );
}

export function DevShellPreviewPage() {
  if (import.meta.env.PROD) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-sm text-ink-muted">
        Not available in production.
      </main>
    );
  }

  const search = useSearch({ from: "/dev/shell-preview" });
  const state = search.state ?? "demo";

  if (state === "wizi") {
    return (
      <main className="mx-auto grid max-w-3xl grid-cols-2 gap-4 p-6 sm:grid-cols-4">
        <p className="col-span-full text-sm text-ink-muted">
          <Link to="/dev/shell-preview" className="font-medium text-accent-fill hover:underline">
            ← Shell preview
          </Link>
        </p>
        {wiziMoods.map((mood) => (
          <div
            key={mood}
            className="grid justify-items-center gap-1 rounded-xl bg-surface p-4 shadow-md"
          >
            <Wizi mood={mood} size={104} title={`Wizi, ${mood}`} />
            <b className="text-sm">{mood}</b>
          </div>
        ))}
      </main>
    );
  }

  const empty = state === "empty";

  return (
    <div className="grid gap-2">
      <p className="px-4 pt-3 text-center text-xs text-ink-muted">
        Dev shell preview ·{" "}
        <Link
          to="/dev/shell-preview"
          search={{ state: "demo" }}
          className="font-medium text-accent-fill hover:underline"
        >
          demo
        </Link>
        {" · "}
        <Link
          to="/dev/shell-preview"
          search={{ state: "empty" }}
          className="font-medium text-accent-fill hover:underline"
        >
          empty
        </Link>
        {" · "}
        <Link
          to="/dev/shell-preview"
          search={{ state: "wizi" }}
          className="font-medium text-accent-fill hover:underline"
        >
          wizi moods
        </Link>
      </p>
      <AppShell
        org={{ id: "1", name: "Acme", slug: "acme" }}
        orgs={[
          { id: "1", name: "Acme", slug: "acme" },
          { id: "2", name: "Client: Bakery", slug: "bakery" },
        ]}
        user={{ name: "Sam Kim", email: "sam@acme.io" }}
        usageOverride={
          empty
            ? null
            : {
                plan: "Pro",
                connections: [
                  { id: "a", health: "healthy" },
                  { id: "b", health: "healthy" },
                  { id: "c", health: "attention" },
                ],
                connectionLimit: 5,
                used: { transactional: 33000, broadcast: 10500, inbound: 4710 },
                allowance: 75000,
                aiCredits: 742,
                banner: null,
              }
        }
      >
        <PreviewOverview empty={empty} />
      </AppShell>
    </div>
  );
}
