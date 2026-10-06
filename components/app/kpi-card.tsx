"use client";

import NumberFlow from "@number-flow/react";

import { cn } from "@/lib/utils";

export type KpiTone = "accent" | "success" | "engaged" | "danger" | "warning";

const toneVar: Record<KpiTone, string> = {
  accent: "var(--accent)",
  success: "var(--success)",
  engaged: "var(--engaged)",
  danger: "var(--danger)",
  warning: "var(--warning)",
};

export type KpiDelta = {
  /** Signed change, in the metric's own unit (points for percentages, percent for counts). */
  value: number;
  /** Which direction is good: bounce rate improves when it goes down. */
  goodWhen: "up" | "down";
  suffix?: string;
};

export type KpiCardProps = {
  label: string;
  value: number;
  unit?: "count" | "percent";
  /** Max decimals for percentages (default 1; complaint rates need 2). */
  fractionDigits?: number;
  delta?: KpiDelta | null;
  /** Recent values, oldest first. Empty renders a flat placeholder line. */
  series?: number[];
  tone?: KpiTone;
  /** Accessible summary, e.g. "Bounce rate 1.2%, down 0.4 points from last week". */
  summary?: string;
  className?: string;
};

/** Tiny SVG sparkline — keeps Recharts off the overview/home bundle. */
function Sparkline({ series, tone }: { series: number[]; tone: KpiTone }) {
  const color = toneVar[tone];
  if (series.length < 2) {
    return (
      <div aria-hidden className="flex h-8 items-center">
        <div className="h-0 w-full border-t border-dashed border-line-strong" />
      </div>
    );
  }

  const width = 160;
  const height = 32;
  const padX = 3;
  const padY = 3;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const points = series.map((v, i) => {
    const x = padX + (i / (series.length - 1)) * innerW;
    const y = padY + (1 - (v - min) / span) * innerH;
    return { x, y };
  });
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const last = points[points.length - 1]!;
  const area = `M ${padX},${height - padY} L ${line} L ${width - padX},${height - padY} Z`;

  return (
    <div aria-hidden className="h-8 w-full min-w-0">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none">
        <path d={area} fill={color} fillOpacity={0.12} />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={last.x} cy={last.y} r={2.6} fill={color} />
      </svg>
    </div>
  );
}

/** KPI tile: label, rolling metric, delta chip and a 32px sparkline (FED §6). */
export function KpiCard({
  label,
  value,
  unit = "count",
  fractionDigits = 1,
  delta,
  series = [],
  tone = "accent",
  summary,
  className,
}: KpiCardProps) {
  const good = delta ? (delta.goodWhen === "up" ? delta.value >= 0 : delta.value <= 0) : true;
  return (
    <div
      data-slot="kpi-card"
      className={cn(
        "grid min-w-0 gap-1 rounded-lg bg-surface px-3.5 pt-3.5 pb-2.5 shadow-md",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-1.5 text-[0.78rem] font-medium text-ink-muted">
        <span className="truncate">{label}</span>
        {delta ? (
          <span
            className={cn(
              "rounded-full px-[7px] py-px text-[0.72rem] font-bold whitespace-nowrap",
              good ? "bg-success-soft text-success-ink" : "bg-danger-soft text-danger-ink",
            )}
          >
            {delta.value >= 0 ? "+" : "−"}
            {Math.abs(delta.value)}
            {delta.suffix ?? ""}
          </span>
        ) : null}
      </div>
      <div className="text-[1.375rem] leading-[1.15] font-bold tracking-[-0.02em] tabular-nums min-[420px]:text-[1.625rem]">
        <NumberFlow
          value={value}
          suffix={unit === "percent" ? "%" : undefined}
          format={
            unit === "percent"
              ? { maximumFractionDigits: fractionDigits, minimumFractionDigits: 0 }
              : { maximumFractionDigits: 0 }
          }
        />
      </div>
      {summary ? <span className="sr-only">{summary}</span> : null}
      <Sparkline series={series} tone={tone} />
    </div>
  );
}
