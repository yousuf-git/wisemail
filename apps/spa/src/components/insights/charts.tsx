import { useId, useMemo, useState } from "react";

import type { InsightPoint } from "@/lib/api";
import { cn } from "@/lib/utils";

import { compact, formatCount, formatRate, shortDay } from "./format";

export const SERIES_COLOR = {
  accent: "var(--accent)",
  engaged: "var(--engaged)",
  success: "var(--success)",
  glow: "var(--glow)",
  coral: "var(--coral)",
} as const;
export type SeriesTone = keyof typeof SERIES_COLOR;

export type ChartSeries = {
  key: string;
  label: string;
  tone: SeriesTone;
  value: (point: InsightPoint) => number | null;
};

type Row = { date: string; values: Record<string, number | null> };

function buildRows(points: InsightPoint[], series: ChartSeries[]): Row[] {
  return points.map((p) => {
    const values: Record<string, number | null> = {};
    for (const s of series) values[s.key] = s.value(p);
    return { date: p.date, values };
  });
}

function maxOf(rows: Row[], series: ChartSeries[], guideline?: number) {
  let max = guideline ?? 0;
  for (const row of rows) {
    for (const s of series) {
      const v = row.values[s.key];
      if (v != null && v > max) max = v;
    }
  }
  return max > 0 ? max : 1;
}

function areaPath(
  rows: Row[],
  key: string,
  x: (i: number) => number,
  y: (v: number) => number,
  bottom: number,
) {
  const pts: { i: number; v: number }[] = [];
  rows.forEach((row, i) => {
    const v = row.values[key];
    if (v != null) pts.push({ i, v });
  });
  if (pts.length === 0) return null;
  const line = pts.map((p, n) => `${n === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`).join(" ");
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const area = `${line} L${x(last.i)},${bottom} L${x(first.i)},${bottom} Z`;
  return { line, area, last };
}

/** SVG area/line chart over the daily series (no recharts dependency). */
export function SeriesChart({
  points,
  series,
  unit,
  guideline,
  height = 210,
}: {
  points: InsightPoint[];
  series: ChartSeries[];
  unit: "count" | "percent";
  guideline?: { value: number; label: string };
  height?: number;
}) {
  const gradId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const rows = useMemo(() => buildRows(points, series), [points, series]);
  const pad = { top: 12, right: 12, bottom: 28, left: unit === "percent" ? 40 : 36 };
  const w = 640;
  const innerW = w - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = maxOf(rows, series, guideline ? guideline.value * 1.25 : undefined);
  const x = (i: number) =>
    pad.left + (rows.length <= 1 ? innerW / 2 : (i / (rows.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const bottom = pad.top + innerH;

  const tickIdx =
    rows.length <= 2
      ? rows.map((_, i) => i)
      : [0, Math.floor((rows.length - 1) / 2), rows.length - 1];

  const yTicks = [0, 0.5, 1].map((t) => t * max);

  const active = hover != null ? rows[hover] : null;

  return (
    <div className="relative w-full min-w-0" style={{ height }}>
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="h-full w-full"
        role="img"
        aria-label="Trend chart"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${gradId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_COLOR[s.tone]} stopOpacity={0.18} />
              <stop offset="100%" stopColor={SERIES_COLOR[s.tone]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={pad.left}
              x2={w - pad.right}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text
              x={pad.left - 6}
              y={y(v) + 3}
              textAnchor="end"
              fill="var(--ink-faint)"
              fontSize={11}
            >
              {unit === "percent" ? `${Math.round(v * 10) / 10}%` : compact(v)}
            </text>
          </g>
        ))}

        {tickIdx.map((i) => (
          <text
            key={rows[i]!.date}
            x={x(i)}
            y={height - 8}
            textAnchor="middle"
            fill="var(--ink-faint)"
            fontSize={11}
          >
            {shortDay(rows[i]!.date)}
          </text>
        ))}

        {guideline ? (
          <>
            <line
              x1={pad.left}
              x2={w - pad.right}
              y1={y(guideline.value)}
              y2={y(guideline.value)}
              stroke="var(--neutral)"
              strokeDasharray="4 4"
            />
            <text
              x={w - pad.right}
              y={y(guideline.value) - 4}
              textAnchor="end"
              fill="var(--ink-muted)"
              fontSize={11}
            >
              {guideline.label}
            </text>
          </>
        ) : null}

        {series.map((s) => {
          const path = areaPath(rows, s.key, x, y, bottom);
          if (!path) return null;
          return (
            <g key={s.key}>
              <path d={path.area} fill={`url(#${gradId}-${s.key})`} />
              <path
                d={path.line}
                fill="none"
                stroke={SERIES_COLOR[s.tone]}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle
                cx={x(path.last.i)}
                cy={y(path.last.v)}
                r={3}
                fill={SERIES_COLOR[s.tone]}
              />
            </g>
          );
        })}

        {rows.map((_, i) => (
          <rect
            key={i}
            x={x(i) - innerW / rows.length / 2}
            y={pad.top}
            width={Math.max(innerW / rows.length, 8)}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {hover != null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={pad.top}
            y2={bottom}
            stroke="var(--line-strong)"
            strokeWidth={1}
          />
        ) : null}
      </svg>

      {active ? (
        <div
          className="pointer-events-none absolute top-2 left-1/2 z-10 grid min-w-[10rem] -translate-x-1/2 gap-1 rounded-md bg-surface-raised px-3 py-2 text-xs shadow-lg ring-1 ring-line"
          role="tooltip"
        >
          <span className="font-semibold text-ink">{shortDay(active.date)}</span>
          {series.map((s) => {
            const value = active.values[s.key] ?? null;
            return (
              <span key={s.key} className="flex items-center gap-2 text-ink-secondary">
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ background: SERIES_COLOR[s.tone] }}
                />
                {s.label}
                <b className="ml-auto pl-3 font-semibold text-ink tabular-nums">
                  {value === null
                    ? "–"
                    : unit === "percent"
                      ? formatRate(value, 2)
                      : formatCount(value)}
                </b>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Tiny per-row bounce trend (decorative). */
export function TrendLine({ values, tone = "coral" }: { values: number[]; tone?: SeriesTone }) {
  if (values.length < 2 || values.every((v) => v === 0)) {
    return (
      <div aria-hidden className="flex h-6 w-24 items-center">
        <div className="h-0 w-full border-t border-dashed border-line-strong" />
      </div>
    );
  }
  const max = Math.max(...values, 0.01);
  const w = 96;
  const h = 24;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (w - 6) + 3;
      const y = h - 3 - (v / max) * (h - 6);
      return `${x},${y}`;
    })
    .join(" ");
  const lastX = ((values.length - 1) / (values.length - 1)) * (w - 6) + 3;
  const lastY = h - 3 - (values[values.length - 1]! / max) * (h - 6);
  return (
    <svg width={w} height={h} aria-hidden className={cn("block")}>
      <polyline
        fill="none"
        stroke={SERIES_COLOR[tone]}
        strokeWidth={1.5}
        strokeLinejoin="round"
        points={pts}
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={SERIES_COLOR[tone]} />
    </svg>
  );
}
