import type { InsightsDTO } from "@/lib/dto/insights";
import { round1 } from "@/lib/services/insights-math";

/** Overview numbers for the org dashboard, derived from the 7 day insights. Client-safe. */
export type OverviewKpiKey = "sent" | "delivered" | "opened" | "bounced";

export type OverviewKpi = {
  key: OverviewKpiKey;
  label: string;
  value: number;
  unit: "count" | "percent";
  /** Change versus the previous period, or null when there is nothing to compare. */
  delta: { value: number; goodWhen: "up" | "down"; suffix?: string } | null;
  /** Daily values, oldest first. */
  series: number[];
};

export type Overview = {
  /** True once at least one Resend connection is active. */
  hasConnection: boolean;
  /** True once any email event has been recorded. */
  hasData: boolean;
  periodLabel: string;
  kpis: OverviewKpi[];
  /** Greeting line built from the numbers. */
  summary: string;
};

/** Bounce guideline from the PRD (§5.5): stay under 4%. */
const BOUNCE_GUIDELINE = 4;

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

const delta = (
  value: number | null,
  goodWhen: "up" | "down",
  suffix: string,
): OverviewKpi["delta"] => (value === null ? null : { value, goodWhen, suffix });

export function overviewSummary(
  dto: InsightsDTO | null,
  hasConnection: boolean,
  canSeeInsights = true,
): string {
  if (!hasConnection) {
    return "Nothing to report yet. Let's connect your first Resend account and I'll keep watch.";
  }
  if (!canSeeInsights) return "Here is how your email is doing.";
  if (!dto?.hasData || (dto.totals.sent === 0 && dto.totals.received === 0)) {
    return "Connected and listening. Numbers appear here as soon as email flows.";
  }
  const { totals, rates } = dto;
  const parts: string[] = [];
  if (totals.sent > 0) {
    parts.push(`${plural(totals.sent, "email")} sent`);
    if (rates.delivered !== null) parts.push(`${round1(rates.delivered)}% delivered`);
  }
  if (totals.received > 0) parts.push(`${plural(totals.received, "reply", "replies")} received`);
  let line = `In the last 7 days: ${parts.join(", ")}.`;
  if (totals.complained > 0) {
    line += ` ${plural(totals.complained, "complaint")} to look at.`;
  } else if (rates.bounced !== null && rates.bounced > BOUNCE_GUIDELINE) {
    line += ` Bounce rate is ${round1(rates.bounced)}%, above the ${BOUNCE_GUIDELINE}% guideline.`;
  } else if (totals.sent > 0) {
    line += " Nothing needs your attention.";
  }
  return line;
}

export function buildOverview(
  dto: InsightsDTO | null,
  hasConnection: boolean,
  canSeeInsights = true,
): Overview {
  const series = dto?.series ?? [];
  const rate = (v: number | null) => (v === null ? 0 : round1(v));
  const rateSeries = (key: "delivered" | "opened" | "bounced") =>
    series.map((p) => rate(p.rates[key]));
  return {
    hasConnection,
    hasData: !!dto?.hasData,
    periodLabel: "Last 7 days",
    summary: overviewSummary(dto, hasConnection, canSeeInsights),
    kpis: [
      {
        key: "sent",
        label: "Sent",
        value: dto?.totals.sent ?? 0,
        unit: "count",
        delta: delta(dto?.deltas.sent ?? null, "up", "%"),
        series: series.map((p) => p.counts.sent),
      },
      {
        key: "delivered",
        label: "Delivered",
        value: rate(dto?.rates.delivered ?? null),
        unit: "percent",
        delta: delta(dto?.deltas.rates.delivered ?? null, "up", " pts"),
        series: rateSeries("delivered"),
      },
      {
        key: "opened",
        label: "Opened (est.)",
        value: rate(dto?.rates.opened ?? null),
        unit: "percent",
        delta: delta(dto?.deltas.rates.opened ?? null, "up", " pts"),
        series: rateSeries("opened"),
      },
      {
        key: "bounced",
        label: "Bounced",
        value: rate(dto?.rates.bounced ?? null),
        unit: "percent",
        delta: delta(dto?.deltas.rates.bounced ?? null, "down", " pts"),
        series: rateSeries("bounced"),
      },
    ],
  };
}
