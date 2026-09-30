"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { InsightPoint } from "@/lib/dto/insights";
import { formatCount, formatRate, shortDay } from "./format";

/** Series colors from the design tokens (FED §2.4 order: accent, engaged, success, glow, coral). */
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
  /** Value at a point; null renders a gap. */
  value: (point: InsightPoint) => number | null;
};

/** Charts draw in on first view only, not on every live refetch (FED §9.3). */
function useDrawIn() {
  const reduced = useReducedMotion();
  const [first, setFirst] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setFirst(false), 900);
    return () => clearTimeout(timer);
  }, []);
  return first && !reduced;
}

type TooltipPayload = { dataKey?: string | number; value?: number | null; color?: string };

function ChartTooltip({
  active,
  payload,
  label,
  series,
  unit,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  series: ChartSeries[];
  unit: "count" | "percent";
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="grid gap-1 rounded-md bg-surface-raised px-3 py-2 text-xs shadow-lg ring-1 ring-line">
      <span className="font-semibold text-ink">{shortDay(String(label))}</span>
      {series.map((s) => {
        const item = payload.find((p) => p.dataKey === s.key);
        const value = item?.value ?? null;
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
  );
}

const tick = { fill: "var(--ink-faint)", fontSize: 11 };

/** Area chart over the daily series: 1.5px line, 12% fill, dot on the latest point (FED §2.4). */
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
  /** Dashed reference line, e.g. the 4% bounce guideline. */
  guideline?: { value: number; label: string };
  height?: number;
}) {
  const animate = useDrawIn();
  const data = points.map((p) => {
    const row: Record<string, number | string | null> = { date: p.date };
    for (const s of series) row[s.key] = s.value(p);
    return row;
  });
  const last = data.length - 1;
  return (
    <div style={{ height }} className="w-full min-w-0">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        initialDimension={{ width: 480, height }}
      >
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="date"
            tickFormatter={shortDay}
            tick={tick}
            tickLine={false}
            axisLine={{ stroke: "var(--line)" }}
            minTickGap={28}
            padding={{ left: 8, right: 8 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={tick}
            tickLine={false}
            axisLine={false}
            width={unit === "percent" ? 44 : 36}
            allowDecimals={unit === "percent"}
            domain={[
              0,
              guideline ? (max: number) => Math.max(max, guideline.value * 1.25) : "auto",
            ]}
            tickFormatter={(v: number) =>
              unit === "percent" ? `${Math.round(v * 10) / 10}%` : compact(v)
            }
          />
          <Tooltip
            cursor={{ stroke: "var(--line-strong)" }}
            content={(props) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as unknown as TooltipPayload[] | undefined}
                label={props.label}
                series={series}
                unit={unit}
              />
            )}
          />
          {guideline ? (
            <ReferenceLine
              y={guideline.value}
              stroke="var(--neutral)"
              strokeDasharray="4 4"
              label={{
                value: guideline.label,
                position: "insideTopRight",
                fill: "var(--ink-muted)",
                fontSize: 11,
              }}
            />
          ) : null}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={SERIES_COLOR[s.tone]}
              strokeWidth={1.5}
              fill={SERIES_COLOR[s.tone]}
              fillOpacity={0.12}
              connectNulls={false}
              isAnimationActive={animate}
              animationDuration={600}
              dot={(props: { cx?: number; cy?: number; index?: number }) =>
                props.index === last && props.cx != null && props.cy != null ? (
                  <circle
                    key="last"
                    cx={props.cx}
                    cy={props.cy}
                    r={3}
                    fill={SERIES_COLOR[s.tone]}
                  />
                ) : (
                  <g key={props.index} />
                )
              }
              activeDot={{ r: 3.5, strokeWidth: 0 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const compact = (n: number) =>
  n >= 1_000_000
    ? `${+(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${+(n / 1000).toFixed(1)}k`
      : String(n);

/** Tiny per-row trend line (bounce rate per day). Decorative: the row states the numbers. */
export function TrendLine({ values, tone = "coral" }: { values: number[]; tone?: SeriesTone }) {
  const animate = useDrawIn();
  if (values.length < 2 || values.every((v) => v === 0)) {
    return (
      <div aria-hidden className="flex h-6 w-24 items-center">
        <div className="h-0 w-full border-t border-dashed border-line-strong" />
      </div>
    );
  }
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div aria-hidden className="h-6 w-24">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        initialDimension={{ width: 96, height: 24 }}
      >
        <LineChart
          data={data}
          margin={{ top: 3, right: 3, bottom: 3, left: 3 }}
          accessibilityLayer={false}
        >
          <YAxis hide domain={[0, "dataMax"]} />
          <Line
            type="monotone"
            dataKey="v"
            stroke={SERIES_COLOR[tone]}
            strokeWidth={1.5}
            isAnimationActive={animate}
            dot={(props: { cx?: number; cy?: number; index?: number }) =>
              props.index === data.length - 1 && props.cx != null && props.cy != null ? (
                <circle key="last" cx={props.cx} cy={props.cy} r={2.5} fill={SERIES_COLOR[tone]} />
              ) : (
                <g key={props.index} />
              )
            }
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
