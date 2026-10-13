"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { ChartLine } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { KpiCard, type KpiTone } from "@/components/app/kpi-card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  INSIGHT_RANGES,
  type InsightFilterOptions,
  type InsightFilters,
  type InsightRange,
  type InsightsDTO,
  type InsightStream,
} from "@/lib/dto/insights";
import { topics } from "@/lib/realtime/topics";
import { useLiveQuery } from "@/lib/realtime/use-live-query";
import { round1, type RateKey } from "@/lib/services/insights-math";
import { cn } from "@/lib/utils";
import { fetchInsights, insightsKey } from "./api";
import { SeriesChart, type ChartSeries } from "./charts";
import { DomainTable } from "./domain-table";
import {
  BOUNCE_GUIDELINE,
  COMPLAINT_GUIDELINE,
  OPEN_ESTIMATE_NOTE,
  RATE_LABELS,
  formatCount,
  formatRate,
} from "./format";

const ALL = "__all__";
const STREAMS: { value: InsightStream; label: string }[] = [
  { value: "transactional", label: "Transactional" },
  { value: "broadcast", label: "Broadcast" },
  { value: "inbound", label: "Inbound" },
];

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger size="sm" aria-label={label} className="min-w-[8.5rem] bg-surface">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ChartCard({
  title,
  caption,
  children,
  className,
  legend,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
  className?: string;
  legend: { label: string; color: string }[];
}) {
  return (
    <figure
      className={cn("grid min-w-0 gap-2 rounded-lg bg-surface p-4 shadow-md", className)}
      aria-label={`${title}. ${caption}`}
    >
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[0.9375rem] font-semibold">{title}</span>
        <span className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
          {legend.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </span>
      </figcaption>
      {children}
    </figure>
  );
}

const volumeSeries: ChartSeries[] = [
  { key: "sent", label: "Sent", tone: "accent", value: (p) => p.counts.sent },
  { key: "delivered", label: "Delivered", tone: "success", value: (p) => p.counts.delivered },
];
const engagementSeries: ChartSeries[] = [
  { key: "opened", label: "Opened (est.)", tone: "engaged", value: (p) => p.rates.opened },
  { key: "clicked", label: "Clicked", tone: "accent", value: (p) => p.rates.clicked },
];
const bounceSeries: ChartSeries[] = [
  { key: "bounced", label: "Bounced", tone: "coral", value: (p) => p.rates.bounced },
];

const COLOR = {
  accent: "var(--accent)",
  success: "var(--success)",
  engaged: "var(--engaged)",
  coral: "var(--coral)",
};

function Kpis({ data }: { data: InsightsDTO }) {
  const rateKpi = (key: RateKey, tone: KpiTone, goodWhen: "up" | "down", fractionDigits = 1) => ({
    key,
    label: RATE_LABELS[key],
    value: round1(data.rates[key] ?? 0),
    unit: "percent" as const,
    fractionDigits,
    tone,
    delta:
      data.deltas.rates[key] === null
        ? null
        : { value: data.deltas.rates[key]!, goodWhen, suffix: " pts" },
    series: data.series.map((p) => Math.round((p.rates[key] ?? 0) * 100) / 100),
    summary: `${RATE_LABELS[key]} ${formatRate(data.rates[key], 2)}`,
  });
  const items = [
    {
      key: "sent",
      label: "Sent",
      value: data.totals.sent,
      unit: "count" as const,
      fractionDigits: 1,
      tone: "accent" as KpiTone,
      delta:
        data.deltas.sent === null
          ? null
          : { value: data.deltas.sent, goodWhen: "up" as const, suffix: "%" },
      series: data.series.map((p) => p.counts.sent),
      summary: `Sent ${formatCount(data.totals.sent)}`,
    },
    rateKpi("delivered", "success", "up"),
    rateKpi("opened", "engaged", "up"),
    rateKpi("clicked", "accent", "up"),
    rateKpi("bounced", "danger", "down"),
    {
      ...rateKpi("complained", "warning", "down", 2),
      value: Math.round((data.rates.complained ?? 0) * 100) / 100,
    },
  ];
  return (
    <ul
      className="grid grid-cols-2 gap-3 min-[760px]:grid-cols-3 min-[1100px]:grid-cols-6"
      data-testid="insight-kpis"
    >
      {items.map((kpi) => (
        <li key={kpi.key} className="min-w-0" data-kpi={kpi.key}>
          <KpiCard
            label={kpi.label}
            value={kpi.value}
            unit={kpi.unit}
            fractionDigits={kpi.fractionDigits}
            delta={kpi.delta}
            series={kpi.series}
            tone={kpi.tone}
            summary={kpi.summary}
            className="h-full"
          />
        </li>
      ))}
    </ul>
  );
}

export function InsightsView({
  orgSlug,
  initial,
  initialDays,
  initialFilters,
  options,
  canManageConnections,
}: {
  orgSlug: string;
  initial: InsightsDTO | null;
  initialDays: InsightRange;
  initialFilters: InsightFilters;
  options: InsightFilterOptions;
  canManageConnections: boolean;
}) {
  const [days, setDays] = useState<InsightRange>(initialDays);
  const [filters, setFilters] = useState<InsightFilters>(initialFilters);
  const [initialKey] = useState(() => JSON.stringify([initialDays, initialFilters]));
  const isInitial = JSON.stringify([days, filters]) === initialKey;

  // Keep the URL shareable without a navigation.
  useEffect(() => {
    const search = new URLSearchParams();
    if (days !== 7) search.set("days", String(days));
    for (const [k, v] of Object.entries(filters)) if (v) search.set(k, v);
    const qs = search.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [days, filters]);

  const query = useLiveQuery({
    queryKey: insightsKey(orgSlug, days, filters),
    queryFn: () => fetchInsights(orgSlug, days, filters),
    topics: [topics.insights()],
    initialData: isInitial ? (initial ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    enabled: options.hasConnection,
  });
  const data = query.data;

  const visibleDomains = useMemo(
    () =>
      options.domains.filter(
        (d) =>
          (!filters.connectionId || d.connectionId === filters.connectionId) &&
          (!filters.projectId || d.projectId === filters.projectId),
      ),
    [options.domains, filters.connectionId, filters.projectId],
  );
  const set = (patch: Partial<InsightFilters>) =>
    setFilters((f) => {
      const next = { ...f, ...patch };
      if (
        next.domainId &&
        !visibleDomains.some((d) => d.id === next.domainId) &&
        !("domainId" in patch)
      ) {
        delete next.domainId;
      }
      return Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as InsightFilters;
    });

  if (!options.hasConnection) {
    return (
      <EmptyState
        title="Connect Resend to see insights"
        action={
          canManageConnections ? (
            <Button asChild>
              <Link href={`/${orgSlug}/settings/connections`}>Connect an account</Link>
            </Button>
          ) : null
        }
      >
        Delivery, bounce and engagement trends appear here once your first account has synced.
      </EmptyState>
    );
  }

  const filtered = Object.keys(filters).length > 0;
  const rangeLabel = `last ${days} days`;

  return (
    <div className="grid gap-3.5">
      <div role="search" aria-label="Insight filters" className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Date range"
          className="inline-flex rounded-full bg-canvas-sunken p-0.5"
        >
          {INSIGHT_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={days === r}
              onClick={() => setDays(r)}
              className={cn(
                "rounded-full px-3 py-1 text-[13px] font-semibold transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent",
                days === r ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
              )}
            >
              {r} days
            </button>
          ))}
        </div>
        {options.connections.length > 1 ? (
          <FilterSelect
            label="Connection"
            value={filters.connectionId}
            onChange={(connectionId) => set({ connectionId, domainId: undefined })}
            options={options.connections.map((c) => ({ value: c.id, label: c.name }))}
            allLabel="All connections"
          />
        ) : null}
        {options.projects.length > 0 ? (
          <FilterSelect
            label="Project"
            value={filters.projectId}
            onChange={(projectId) => set({ projectId, domainId: undefined })}
            options={options.projects.map((p) => ({ value: p.id, label: p.name }))}
            allLabel="All projects"
          />
        ) : null}
        {visibleDomains.length > 0 ? (
          <FilterSelect
            label="Domain"
            value={filters.domainId}
            onChange={(domainId) => set({ domainId })}
            options={visibleDomains.map((d) => ({ value: d.id, label: d.name }))}
            allLabel="All domains"
          />
        ) : null}
        <FilterSelect
          label="Stream"
          value={filters.stream}
          onChange={(stream) => set({ stream: stream as InsightStream | undefined })}
          options={STREAMS}
          allLabel="All streams"
        />
        {filtered ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setFilters({})}>
            Clear filters
          </Button>
        ) : null}
      </div>

      {!data ? (
        <p role="status" className="p-6 text-center text-sm text-ink-muted">
          Loading insights…
        </p>
      ) : !data.hasData ? (
        <EmptyState
          title={filtered ? "No email matches these filters" : `No email in the ${rangeLabel} yet`}
          mood="idle"
          action={
            filtered ? (
              <Button variant="outline" onClick={() => setFilters({})}>
                Clear filters
              </Button>
            ) : null
          }
        >
          {filtered
            ? "Try a wider range or remove a filter."
            : "Send or receive an email and the numbers show up here within seconds."}
        </EmptyState>
      ) : (
        <>
          <Kpis data={data} />

          <div className="grid gap-3.5 min-[1000px]:grid-cols-2">
            <ChartCard
              title="Volume"
              caption={`${formatCount(data.totals.sent)} sent and ${formatCount(data.totals.delivered)} delivered in the ${rangeLabel}.`}
              legend={[
                { label: "Sent", color: COLOR.accent },
                { label: "Delivered", color: COLOR.success },
              ]}
              className="min-[1000px]:col-span-2"
            >
              <SeriesChart points={data.series} series={volumeSeries} unit="count" height={220} />
            </ChartCard>
            <ChartCard
              title="Deliverability"
              caption={`Bounce rate ${formatRate(data.rates.bounced, 2)} against the ${BOUNCE_GUIDELINE}% guideline. Complaint rate ${formatRate(data.rates.complained, 2)} against ${COMPLAINT_GUIDELINE}%.`}
              legend={[{ label: "Bounce rate", color: COLOR.coral }]}
            >
              <SeriesChart
                points={data.series}
                series={bounceSeries}
                unit="percent"
                guideline={{ value: BOUNCE_GUIDELINE, label: `${BOUNCE_GUIDELINE}% guideline` }}
              />
              <p className="text-xs text-ink-muted">
                {formatCount(data.totals.bouncedHard)} hard and{" "}
                {formatCount(data.totals.bouncedSoft)} soft bounces,{" "}
                {formatCount(data.totals.suppressed)} suppressed,{" "}
                {formatCount(data.totals.complained)} complaints (guideline under{" "}
                {COMPLAINT_GUIDELINE}%).
              </p>
            </ChartCard>
            <ChartCard
              title="Engagement (estimates)"
              caption={`Opened ${formatRate(data.rates.opened)} and clicked ${formatRate(data.rates.clicked)} of delivered.`}
              legend={[
                { label: "Opened (est.)", color: COLOR.engaged },
                { label: "Clicked", color: COLOR.accent },
              ]}
            >
              <SeriesChart points={data.series} series={engagementSeries} unit="percent" />
              <p className="text-xs text-ink-muted">{OPEN_ESTIMATE_NOTE}</p>
            </ChartCard>
          </div>

          <DomainTable domains={data.domains} />

          {data.totals.received > 0 || filters.stream === "inbound" ? (
            <p className="text-sm text-ink-muted" data-testid="inbound-line">
              <ChartLine
                aria-hidden
                className="mr-1.5 inline size-4 align-text-bottom text-engaged"
              />
              {formatCount(data.totals.received)} received, {formatCount(data.totals.replied)}{" "}
              replied to in the {rangeLabel}.
            </p>
          ) : null}

          <p className="text-xs text-ink-muted" data-testid="insights-footnote">
            {data.timezone === "UTC" && data.days > 30
              ? "Daily totals over 90 days use UTC days."
              : `Days are cut in ${data.timezone}.`}{" "}
            Rates compare with the previous {data.days} days. Bounce rate is over sent; opens,
            clicks and complaints are over delivered.
          </p>
        </>
      )}
    </div>
  );
}
