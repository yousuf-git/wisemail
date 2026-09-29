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
  aiCredits?: number | null;
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

  return (
    <div
      data-slot="usage-tile"
      className={cn("grid gap-2.5 rounded-lg bg-canvas p-3 text-[0.78rem]", className)}
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
          <i className="block h-full bg-accent" style={{ width: `${pct(used.transactional)}%` }} />
          <i className="block h-full bg-engaged" style={{ width: `${pct(used.broadcast)}%` }} />
          <i className="block h-full bg-success" style={{ width: `${pct(used.inbound)}%` }} />
        </div>
        <span className="text-[0.72rem] text-ink-faint">
          {allowance ? `of ${nf.format(allowance)} this period` : "Allowance not set"}
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
