import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ChartLine } from "lucide-react";
import { useMemo, useState } from "react";

import { SeriesChart, type ChartSeries } from "@/components/insights/charts";
import { DomainTable } from "@/components/insights/domain-table";
import {
  BOUNCE_GUIDELINE,
  COMPLAINT_GUIDELINE,
  OPEN_ESTIMATE_NOTE,
  RATE_LABELS,
  formatCount,
  formatRate,
} from "@/components/insights/format";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import {
  getInsightFilterOptions,
  getInsights,
  type InsightFilters,
  type InsightRange,
  type InsightStream,
  type InsightsDTO,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const STREAMS: { value: InsightStream; label: string }[] = [
  { value: "transactional", label: "Transactional" },
  { value: "broadcast", label: "Broadcast" },
  { value: "inbound", label: "Inbound" },
];

const COLOR = {
  accent: "var(--accent)",
  success: "var(--success)",
  engaged: "var(--engaged)",
  coral: "var(--coral)",
};

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
    <label className="grid gap-0.5 text-xs text-ink-muted">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="h-8 min-w-[8.5rem] rounded-control border border-line bg-surface px-2 text-sm text-ink"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
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
      className={cn(
        "grid min-w-0 gap-2 rounded-lg border border-line bg-surface p-4 shadow-sm",
        className,
      )}
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

function Sparkline({ series }: { series: number[] }) {
  if (series.length < 2) return null;
  const max = Math.max(...series, 1);
  const w = 64;
  const h = 24;
  const pts = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = h - (v / max) * (h - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} aria-hidden className="text-ink-faint">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={pts} />
    </svg>
  );
}

function Kpis({ data }: { data: InsightsDTO }) {
  const rateKpi = (
    key: keyof typeof RATE_LABELS,
    goodWhen: "up" | "down",
    fractionDigits = 1,
  ) => ({
    key,
    label: RATE_LABELS[key],
    value: Math.round((data.rates[key] ?? 0) * 10 ** fractionDigits) / 10 ** fractionDigits,
    unit: "percent" as const,
    delta:
      data.deltas.rates[key] === null
        ? null
        : { value: data.deltas.rates[key]!, goodWhen, suffix: " pts" },
    series: data.series.map((p) => Math.round((p.rates[key] ?? 0) * 100) / 100),
  });

  const items = [
    {
      key: "sent",
      label: "Sent",
      value: data.totals.sent,
      unit: "count" as const,
      delta:
        data.deltas.sent === null
          ? null
          : { value: data.deltas.sent, goodWhen: "up" as const, suffix: "%" },
      series: data.series.map((p) => p.counts.sent),
    },
    rateKpi("delivered", "up"),
    rateKpi("opened", "up"),
    rateKpi("clicked", "up"),
    rateKpi("bounced", "down"),
    {
      ...rateKpi("complained", "down", 2),
      value: Math.round((data.rates.complained ?? 0) * 100) / 100,
    },
  ];

  return (
    <ul
      className="grid grid-cols-2 gap-3 min-[760px]:grid-cols-3 min-[1100px]:grid-cols-6"
      data-testid="insight-kpis"
      data-tour="insights-kpis"
    >
      {items.map((kpi) => (
        <li key={kpi.key} className="min-w-0" data-kpi={kpi.key}>
          <div className="grid h-full gap-1 rounded-lg border border-line bg-surface p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {kpi.label}
              </p>
              <Sparkline series={kpi.series} />
            </div>
            <p className="text-xl font-semibold tracking-tight tabular-nums">
              {kpi.unit === "percent" ? `${kpi.value}%` : kpi.value.toLocaleString()}
            </p>
            {kpi.delta ? (
              <p className="text-xs text-ink-muted">
                {kpi.delta.value > 0 ? "+" : ""}
                {kpi.delta.value}
                {kpi.delta.suffix} vs prior
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function InsightsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/insights" });
  const [days, setDays] = useState<InsightRange>(7);
  const [filters, setFilters] = useState<InsightFilters>({});

  const options = useQuery({
    queryKey: ["insights-options", orgSlug],
    queryFn: () => getInsightFilterOptions(orgSlug),
  });

  const insights = useQuery({
    queryKey: ["insights", orgSlug, days, filters],
    queryFn: () => getInsights(orgSlug, days, filters),
    placeholderData: keepPreviousData,
    enabled: options.data?.hasConnection !== false,
  });

  const visibleDomains = useMemo(
    () =>
      (options.data?.domains ?? []).filter(
        (d) =>
          (!filters.connectionId || d.connectionId === filters.connectionId) &&
          (!filters.projectId || d.projectId === filters.projectId),
      ),
    [options.data?.domains, filters.connectionId, filters.projectId],
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

  const filtered = Object.keys(filters).length > 0;
  const rangeLabel = `last ${days} days`;
  const data = insights.data;

  return (
    <ResourcePage title="Insights" description="Delivery, bounce and engagement trends">
      {options.isPending ? (
        <ResourcePending />
      ) : options.isError ? (
        <ResourceError message="Could not load insights." />
      ) : !options.data.hasConnection ? (
        <ResourceEmpty>
          Connect Resend to see insights.{" "}
          <Link
            to="/$orgSlug/settings/connections"
            params={{ orgSlug }}
            className="font-semibold text-accent-fill underline"
          >
            Connect an account
          </Link>
        </ResourceEmpty>
      ) : (
        <div className="grid gap-3.5">
          <div
            role="search"
            aria-label="Insight filters"
            data-tour="insights-filters"
            className="flex flex-wrap items-center gap-2"
          >
            <div
              role="group"
              aria-label="Date range"
              className="inline-flex rounded-full bg-canvas-sunken p-0.5"
            >
              {([7, 30, 90] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={days === r}
                  onClick={() => setDays(r)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    days === r ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {r} days
                </button>
              ))}
            </div>
            {options.data.connections.length > 1 ? (
              <FilterSelect
                label="Connection"
                value={filters.connectionId}
                onChange={(connectionId) => set({ connectionId, domainId: undefined })}
                options={options.data.connections.map((c) => ({ value: c.id, label: c.name }))}
                allLabel="All connections"
              />
            ) : null}
            {options.data.projects.length > 0 ? (
              <FilterSelect
                label="Project"
                value={filters.projectId}
                onChange={(projectId) => set({ projectId, domainId: undefined })}
                options={options.data.projects.map((p) => ({ value: p.id, label: p.name }))}
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
              <button
                type="button"
                onClick={() => setFilters({})}
                className="h-8 rounded-control px-2.5 text-sm font-medium text-ink-secondary hover:bg-canvas-sunken"
              >
                Clear filters
              </button>
            ) : null}
          </div>

          {insights.isPending && !data ? (
            <ResourcePending />
          ) : insights.isError ? (
            <ResourceError message="Could not load insights." />
          ) : !data?.hasData ? (
            <div data-tour="insights-kpis">
              <ResourceEmpty>
                {filtered
                  ? "No email matches these filters. Try a wider range or clear filters."
                  : `No email in the ${rangeLabel} yet.`}
              </ResourceEmpty>
              <p className="mt-2 text-xs text-ink-muted" data-tour="insights-open-note">
                Open rates are estimates — privacy features can inflate them.
              </p>
            </div>
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
                  <p className="text-xs text-ink-muted" data-tour="insights-open-note">
                    {OPEN_ESTIMATE_NOTE}
                  </p>
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
      )}
    </ResourcePage>
  );
}
