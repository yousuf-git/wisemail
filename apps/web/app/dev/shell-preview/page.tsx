import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { OverviewContent } from "@/components/app/overview";
import { wiziMoods } from "@/components/mascot/moods";
import { Wizi } from "@/components/mascot/wizi";
import type { Overview } from "@/components/app/overview-model";

/** Dev-only visual harness for the app shell with mock data. Not available in production. */

const demo: Overview = {
  hasConnection: true,
  hasData: true,
  periodLabel: "Last 7 days",
  summary: "In the last 7 days: 12,480 emails sent, 98.6% delivered. Nothing needs your attention.",
  kpis: [
    {
      key: "sent",
      label: "Sent",
      value: 12480,
      unit: "count",
      delta: { value: 8, goodWhen: "up", suffix: "%" },
      series: [9.2, 10.1, 9.8, 11, 10.6, 11.8, 12, 12.48],
    },
    {
      key: "delivered",
      label: "Delivered",
      value: 98.6,
      unit: "percent",
      delta: { value: 0.4, goodWhen: "up" },
      series: [97.8, 98.1, 97.9, 98.3, 98.2, 98.5, 98.4, 98.6],
    },
    {
      key: "opened",
      label: "Opened (est.)",
      value: 41.2,
      unit: "percent",
      delta: { value: 2.1, goodWhen: "up" },
      series: [36, 38, 37, 39, 40, 39, 41, 41.2],
    },
    {
      key: "bounced",
      label: "Bounced",
      value: 1.1,
      unit: "percent",
      delta: { value: -0.3, goodWhen: "down" },
      series: [1.6, 1.5, 1.4, 1.5, 1.3, 1.2, 1.2, 1.1],
    },
  ],
};

const empty: Overview = {
  hasConnection: false,
  hasData: false,
  periodLabel: "Last 7 days",
  summary: "Nothing to report yet. Let's connect your first Resend account and I'll keep watch.",
  kpis: demo.kpis.map((k) => ({ ...k, value: 0, delta: null, series: [] })),
};

export default async function ShellPreview({ searchParams }: PageProps<"/dev/shell-preview">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  const overview = state === "empty" ? empty : demo;

  if (state === "wizi") {
    return (
      <main className="mx-auto grid max-w-3xl grid-cols-2 gap-4 p-6 sm:grid-cols-4">
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

  return (
    <AppShell
      org={{ id: "1", name: "Acme", slug: "acme" }}
      orgs={[
        { id: "1", name: "Acme", slug: "acme" },
        { id: "2", name: "Client: Bakery", slug: "bakery" },
      ]}
      user={{ name: "Sam Kim", email: "sam@acme.io" }}
      role="owner"
      usage={
        state === "empty"
          ? undefined
          : {
              plan: "Pro",
              connections: [
                { id: "a", health: "healthy" },
                { id: "b", health: "healthy" },
                { id: "c", health: "attention" },
              ],
              used: { transactional: 33000, broadcast: 10500, inbound: 4710 },
              allowance: 75000,
              aiCredits: 742,
            }
      }
    >
      <OverviewContent orgSlug="acme" overview={overview} userName="Sam Kim" />
    </AppShell>
  );
}
