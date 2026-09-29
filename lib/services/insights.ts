import "server-only";

import { Types } from "mongoose";

import type { OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { ConnectionModel } from "@/lib/db/models/connections";
import { DomainModel } from "@/lib/db/models/domains";
import { MetricRollupModel } from "@/lib/db/models/metric-rollups";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { ProjectModel } from "@/lib/db/models/projects";
import type {
  InsightDomainRow,
  InsightFilterOptions,
  InsightFilters,
  InsightPoint,
  InsightRange,
  InsightsDTO,
} from "@/lib/dto/insights";
import {
  addCounts,
  computeDeltas,
  computeRates,
  countsFromRollup,
  dayKey,
  emptyCounts,
  isValidTimeZone,
  lastDayKeys,
  zonedMidnight,
  type Counts,
} from "./insights-math";
import { projectFilter } from "./project-scope";

/**
 * Insights over `metric_rollups` (TRD §2.7): never scans raw events. Ranges of 7 and 30 days read
 * hourly buckets and cut days in the org's time zone; 90 days reads daily buckets, which are UTC
 * days. The previous period (for deltas) reads hourly buckets for 7 days and daily buckets
 * beyond, because hourly buckets live 35 days. Project-scoped members only see their projects
 * (`projectFilter`), whatever filters they pass.
 */

const TOP_DOMAINS = 10;

type Bucket = { at: Date; domainId: Types.ObjectId | null; counts: Counts };

const oid = (id: string) => new Types.ObjectId(id);
const utcMidnight = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Scoped member asking for a project outside their scope, or an unusable id: nothing to show. */
function scopeAllows(ctx: Pick<OrgContext, "projectScope">, filters: InsightFilters): boolean {
  if (filters.projectId && ctx.projectScope && !ctx.projectScope.includes(filters.projectId)) {
    return false;
  }
  return true;
}

async function readBuckets(
  ctx: OrgContext,
  filters: InsightFilters,
  granularity: "hour" | "day",
  from: Date,
  to: Date,
): Promise<Bucket[]> {
  const scope = projectFilter(ctx);
  const match: Record<string, unknown> = {
    orgId: oid(ctx.org.id),
    granularity,
    bucketStart: { $gte: from, $lt: to },
    "dimension.kind": filters.stream ? "stream" : "all",
    "dimension.value": filters.stream ?? "",
    ...scope,
  };
  if (filters.connectionId) match.connectionId = oid(filters.connectionId);
  if (filters.domainId) match.domainId = oid(filters.domainId);
  if (filters.projectId) match.projectId = oid(filters.projectId);

  const sum = (field: string) => ({ $sum: `$counts.${field}` });
  const rows = await MetricRollupModel.aggregate<{
    _id: { at: Date; domainId: Types.ObjectId | null };
    [k: string]: unknown;
  }>([
    { $match: match },
    {
      $group: {
        _id: { at: "$bucketStart", domainId: "$domainId" },
        sent: sum("sent"),
        delivered: sum("delivered"),
        delivery_delayed: sum("delivery_delayed"),
        opened_unique: sum("opened_unique"),
        clicked_unique: sum("clicked_unique"),
        bounced_hard: sum("bounced_hard"),
        bounced_soft: sum("bounced_soft"),
        complained: sum("complained"),
        failed: sum("failed"),
        suppressed: sum("suppressed"),
        received: sum("received"),
        replied: sum("replied"),
      },
    },
  ]);
  return rows.map((row) => ({
    at: row._id.at,
    domainId: row._id.domainId ?? null,
    counts: countsFromRollup(row as Record<string, number>),
  }));
}

export async function getOrgTimeZone(orgId: string): Promise<string> {
  await connectDb();
  const settings = await OrgSettingsModel.findOne({ orgId: oid(orgId) }, { timezone: 1 }).lean();
  const tz = settings?.timezone;
  return tz && isValidTimeZone(tz) ? tz : "UTC";
}

export async function getInsights(
  ctx: OrgContext,
  query: { days: InsightRange; filters?: InsightFilters; now?: Date },
): Promise<InsightsDTO> {
  await connectDb();
  const { days } = query;
  const filters = query.filters ?? {};
  const now = query.now ?? new Date();

  const orgZone = await getOrgTimeZone(ctx.org.id);
  const currentGranularity = days <= 30 ? "hour" : "day";
  const timezone = days <= 30 ? orgZone : "UTC";
  const keys = lastDayKeys(now, timezone, days);
  const from = zonedMidnight(keys[0]!, timezone);
  const prevKeys = lastDayKeys(new Date(from.getTime() - 1), timezone, days);
  const prevFrom = zonedMidnight(prevKeys[0]!, timezone);

  const allowed = scopeAllows(ctx, filters);
  const previousGranularity = days <= 7 ? "hour" : "day";
  const [current, previous] = allowed
    ? await Promise.all([
        readBuckets(ctx, filters, currentGranularity, from, new Date(now.getTime() + 1)),
        readBuckets(
          ctx,
          filters,
          previousGranularity,
          previousGranularity === "day" ? utcMidnight(prevFrom) : prevFrom,
          previousGranularity === "day" ? utcMidnight(from) : from,
        ),
      ])
    : [[], []];

  // Per-day and per-domain accumulation.
  const perDay = new Map<string, Counts>(keys.map((k) => [k, emptyCounts()]));
  const perDomain = new Map<string, { counts: Counts; days: Map<string, Counts> }>();
  let totals = emptyCounts();
  for (const bucket of current) {
    const key = dayKey(bucket.at, timezone);
    const day = perDay.get(key);
    if (!day) continue; // outside the window (hour bucket before local midnight edge)
    perDay.set(key, addCounts(day, bucket.counts));
    totals = addCounts(totals, bucket.counts);
    const domainKey = bucket.domainId?.toHexString() ?? "";
    const entry = perDomain.get(domainKey) ?? { counts: emptyCounts(), days: new Map() };
    entry.counts = addCounts(entry.counts, bucket.counts);
    entry.days.set(key, addCounts(entry.days.get(key) ?? emptyCounts(), bucket.counts));
    perDomain.set(domainKey, entry);
  }
  const previousCounts = previous.reduce((acc, b) => addCounts(acc, b.counts), emptyCounts());

  const series: InsightPoint[] = keys.map((date) => {
    const counts = perDay.get(date)!;
    return { date, counts, rates: computeRates(counts) };
  });

  const topIds = [...perDomain.entries()]
    .sort(([, a], [, b]) => b.counts.sent + b.counts.received - (a.counts.sent + a.counts.received))
    .slice(0, TOP_DOMAINS);
  const namedIds = topIds.filter(([id]) => id).map(([id]) => oid(id));
  const domainDocs = namedIds.length
    ? await DomainModel.find({ orgId: oid(ctx.org.id), _id: { $in: namedIds } }, { name: 1 }).lean()
    : [];
  const names = new Map(domainDocs.map((d) => [d._id.toHexString(), d.name]));
  const domains: InsightDomainRow[] = topIds.map(([id, entry]) => ({
    domainId: id || null,
    name: id ? (names.get(id) ?? "Removed domain") : "No domain",
    counts: entry.counts,
    rates: computeRates(entry.counts),
    bounceTrend: keys.map((k) => computeRates(entry.days.get(k) ?? emptyCounts()).bounced ?? 0),
  }));

  const any = (c: Counts) => c.sent + c.received + c.delivered + c.bounced + c.failed > 0;
  return {
    days,
    timezone,
    filters,
    hasData: any(totals) || any(previousCounts),
    totals,
    rates: computeRates(totals),
    previous: { counts: previousCounts, rates: computeRates(previousCounts) },
    deltas: computeDeltas(totals, previousCounts),
    series,
    domains,
    generatedAt: now.toISOString(),
  };
}

/** Choices for the filter bar, limited to what the member may see. */
export async function getInsightFilterOptions(ctx: OrgContext): Promise<InsightFilterOptions> {
  await connectDb();
  const orgId = oid(ctx.org.id);
  const scope = ctx.projectScope;
  const [connections, domains, projects] = await Promise.all([
    ConnectionModel.find({ orgId, deletedAt: null }, { name: 1 }).sort({ createdAt: 1 }).lean(),
    DomainModel.find({ orgId, ...projectFilter(ctx) }, { name: 1, connectionId: 1, projectId: 1 })
      .sort({ name: 1 })
      .lean(),
    ProjectModel.find(
      { orgId, deletedAt: null, ...(scope ? { _id: { $in: scope.map(oid) } } : {}) },
      { name: 1 },
    )
      .sort({ name: 1 })
      .lean(),
  ]);
  return {
    hasConnection: connections.length > 0,
    connections: connections.map((c) => ({ id: c._id.toHexString(), name: c.name })),
    domains: domains.map((d) => ({
      id: d._id.toHexString(),
      name: d.name,
      connectionId: d.connectionId.toHexString(),
      projectId: d.projectId ? d.projectId.toHexString() : null,
    })),
    projects: projects.map((p) => ({ id: p._id.toHexString(), name: p.name })),
  };
}
