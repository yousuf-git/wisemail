import type { BroadcastStatsDTO } from "@/lib/dto/audience";
import { percent } from "./status";

/** Post-send numbers from the events Resend reported (PRD §5.9). Opens are estimates. */
export function BroadcastStats({ stats }: { stats: BroadcastStatsDTO }) {
  const tiles = [
    { label: "Recipients", value: stats.recipients.toLocaleString(), note: null },
    {
      label: "Delivered",
      value: percent(stats.delivered, stats.recipients),
      note: `${stats.delivered.toLocaleString()} emails`,
    },
    {
      label: "Opened",
      value: percent(stats.opened, stats.delivered),
      note: `${stats.opened.toLocaleString()} (estimate)`,
    },
    {
      label: "Clicked",
      value: percent(stats.clicked, stats.delivered),
      note: `${stats.clicked.toLocaleString()} emails`,
    },
    {
      label: "Bounced",
      value: percent(stats.bounced, stats.recipients),
      note: `${stats.bounced.toLocaleString()} emails`,
    },
    { label: "Complaints", value: stats.complained.toLocaleString(), note: null },
  ];
  return (
    <section
      aria-label="Results"
      className="grid gap-3 rounded-xl bg-surface p-4 shadow-md min-[560px]:p-5"
    >
      <h2 className="text-lg font-semibold tracking-[-0.01em]">Results</h2>
      {stats.recipients === 0 ? (
        <p className="text-sm text-ink-muted">
          No results yet. Numbers appear as Resend reports deliveries, opens and clicks for this
          broadcast.
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg bg-canvas-sunken px-3 py-2.5"
            data-testid={`stat-${tile.label.toLowerCase()}`}
          >
            <dt className="text-xs text-ink-muted">{tile.label}</dt>
            <dd className="text-2xl font-bold tabular-nums">{tile.value}</dd>
            {tile.note ? <p className="text-xs text-ink-muted">{tile.note}</p> : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
