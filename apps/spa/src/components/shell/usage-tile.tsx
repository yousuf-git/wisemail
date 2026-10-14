import { Link } from "@tanstack/react-router";

import type { UsageSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

const dot: Record<"healthy" | "attention" | "down", string> = {
  healthy: "bg-success",
  attention: "bg-warning",
  down: "bg-danger",
};

const nf = new Intl.NumberFormat("en-US");

/** Dock usage meter: connections health + tracked emails vs allowance (FED §8). */
export function UsageTile({
  orgSlug,
  usage,
  className,
}: {
  orgSlug: string;
  usage?: UsageSummary;
  className?: string;
}) {
  const connections = usage?.connections ?? [];
  const used = usage?.used ?? { transactional: 0, broadcast: 0, inbound: 0 };
  const total = used.transactional + used.broadcast + used.inbound;
  const allowance = usage?.allowance ?? null;
  const pct = (n: number) => (allowance ? Math.min(100, (n / allowance) * 100) : 0);
  const ratio = allowance ? total / allowance : 0;
  const over = allowance ? Math.max(0, total - allowance) : 0;
  const tone = ratio > 1 ? "danger" : ratio >= 0.8 ? "warning" : null;
  const segment = (base: string) =>
    tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : base;

  return (
    <Link
      to="/$orgSlug/settings/usage"
      params={{ orgSlug }}
      data-slot="usage-tile"
      className={cn(
        "grid gap-2 rounded-control-block border border-line/70 bg-canvas-sunken/60 p-2.5 text-[0.75rem] outline-none hover:border-line focus-visible:ring-2 focus-visible:ring-accent",
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
              <span className="text-ink-muted">
                {connections.length} of {usage.connectionLimit}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-ink-muted">
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
      <div
        role="meter"
        aria-label="Tracked emails this period"
        aria-valuemin={0}
        aria-valuemax={allowance ?? total}
        aria-valuenow={total}
        className="flex h-1.5 overflow-hidden rounded-full bg-line"
      >
        <i className={cn("block h-full", segment("bg-accent"))} style={{ width: `${pct(used.transactional)}%` }} />
        <i className={cn("block h-full", segment("bg-engaged"))} style={{ width: `${pct(used.broadcast)}%` }} />
        <i className={cn("block h-full", segment("bg-success"))} style={{ width: `${pct(used.inbound)}%` }} />
      </div>
      <div className="flex justify-between gap-2 text-ink-muted">
        <span>
          {nf.format(total)}
          {allowance != null ? ` / ${nf.format(allowance)}` : ""} tracked
          {over > 0 ? ` · ${nf.format(over)} over` : ""}
        </span>
        {usage?.aiCredits != null ? <span>{nf.format(usage.aiCredits)} AI</span> : null}
      </div>
    </Link>
  );
}

export function PlanBanner({ banner }: { banner: NonNullable<UsageSummary["banner"]> }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm shadow-sm"
    >
      <p className="min-w-0 text-ink-secondary">{banner.message}</p>
      <a
        href={banner.action.href}
        className="shrink-0 rounded-control bg-accent-fill px-3 py-1.5 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover"
      >
        {banner.action.label}
      </a>
    </div>
  );
}
