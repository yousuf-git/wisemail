import type { PlanBannerData } from "@/components/billing/plan-banner";
import { cn } from "@/lib/utils";

export type ConnectionHealth = "healthy" | "attention" | "down";

export type UsageSummary = {
  plan?: string;
  connections?: { id: string; health: ConnectionHealth }[];
  /** Resend accounts included in the plan; shown as "n of limit". */
  connectionLimit?: number;
  /** Tracked emails this period, split by kind (for the meter segments). */
  used?: { transactional: number; broadcast: number; inbound: number };
  allowance?: number | null;
  /** AI credits still available this period; `null` when the plan has no AI. */
  aiCredits?: number | null;
  /** Estimated overage in USD when over the allowance on a paid plan. */
  overageCostUsd?: number | null;
  /** Plan banner to show above the page (over allowance, trial). */
  banner?: PlanBannerData | null;
};

const dot: Record<ConnectionHealth, string> = {
  healthy: "bg-success",
  attention: "bg-warning",
  down: "bg-danger",
};

const nf = new Intl.NumberFormat("en-US");

/** Grounded tile at the bottom of the dock. Defaults render a calm, empty state. */
export function UsageTile({ usage, className }: { usage?: UsageSummary; className?: string }) {
  const connections = usage?.connections ?? [];
  const used = usage?.used ?? { transactional: 0, broadcast: 0, inbound: 0 };
  const total = used.transactional + used.broadcast + used.inbound;
  const allowance = usage?.allowance ?? null;
  const pct = (n: number) => (allowance ? Math.min(100, (n / allowance) * 100) : 0);
  const ratio = allowance ? total / allowance : 0;
  const over = allowance ? Math.max(0, total - allowance) : 0;
  // FED §8: the bar turns warning from 80% and danger past 100%.
  const tone = ratio > 1 ? "danger" : ratio >= 0.8 ? "warning" : null;
  const segment = (base: string) =>
    tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : base;
  const overCost = usage?.overageCostUsd ?? null;

  return (
    <div
      data-slot="usage-tile"
      className={cn(
        "grid gap-2 rounded-control-block border border-line/70 bg-canvas-sunken/60 p-2.5 text-[0.75rem]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {connections.length > 0 ? (
          <span className="flex items-center gap-2">
            <span
              className="flex gap-[5px]"
              role="img"
              aria-label={`${connections.length} Resend ${connections.length === 1 ? "account" : "accounts"}`}
            >
              {connections.map((c) => (
                <i key={c.id} className={cn("block size-2 rounded-full", dot[c.health])} />
              ))}
            </span>
            {usage?.connectionLimit != null ? (
              <span className="text-ink-muted" data-testid="usage-connections">
                {connections.length} of {usage.connectionLimit}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-ink-muted" data-testid="usage-connections">
            {usage?.connectionLimit != null
              ? `0 of ${usage.connectionLimit} accounts`
              : "No Resend accounts yet"}
          </span>
        )}
        {usage?.plan ? (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.6875rem] font-bold text-info-ink">
            {usage.plan}
          </span>
        ) : null}
      </div>
      <div className="grid gap-[5px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink-muted">Tracked emails</span>
          <b className="font-bold tabular-nums">{nf.format(total)}</b>
        </div>
        <div
          role="meter"
          aria-label="Tracked emails this period"
          aria-valuemin={0}
          aria-valuemax={allowance ?? 0}
          aria-valuenow={total}
          className="flex h-[7px] overflow-hidden rounded-full bg-line"
        >
          <i
            className={cn("block h-full", segment("bg-accent"))}
            style={{ width: `${pct(used.transactional)}%` }}
          />
          <i
            className={cn("block h-full", segment("bg-engaged"))}
            style={{ width: `${pct(used.broadcast)}%` }}
          />
          <i
            className={cn("block h-full", segment("bg-success"))}
            style={{ width: `${pct(used.inbound)}%` }}
          />
        </div>
        <span
          className={cn(
            "text-[0.72rem]",
            over > 0 ? "font-semibold text-danger-ink" : "text-ink-muted",
          )}
          data-testid="usage-allowance"
        >
          {over > 0
            ? `Over by ${nf.format(over)}${overCost ? ` · est. $${overCost.toFixed(2).replace(/\.00$/, "")} overage` : ""}`
            : allowance
              ? `of ${nf.format(allowance)} this period`
              : "Allowance not set"}
        </span>
      </div>
      {usage?.aiCredits != null ? (
        <span className="justify-self-start rounded-full bg-surface px-2.5 py-[3px] text-[0.72rem] font-bold text-warning-ink shadow-glow">
          {nf.format(usage.aiCredits)} AI credits
        </span>
      ) : null}
    </div>
  );
}
