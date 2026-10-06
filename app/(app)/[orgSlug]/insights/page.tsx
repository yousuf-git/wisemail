import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { InsightsView } from "@/components/insights/insights-view";
import { requireOrg } from "@/lib/dal";
import { INSIGHT_RANGES, type InsightFilters, type InsightRange } from "@/lib/dto/insights";
import { getInsightFilterOptions, getInsights } from "@/lib/services/insights";
import { insightsQuery } from "@/app/api/v1/_lib/insights-query";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/insights">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  if (!ctx.can("insights:read")) notFound();

  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = insightsQuery.safeParse(flat);
  const { days, ...filters } = parsed.success
    ? (parsed.data as { days: InsightRange } & InsightFilters)
    : { days: INSIGHT_RANGES[0] as InsightRange };

  const [options, insights] = await Promise.all([
    getInsightFilterOptions(ctx),
    getInsights(ctx, { days, filters }),
  ]);
  const initial = options.hasConnection ? insights : null;

  return (
    <>
      <PageHeader
        title="Insights"
        description="Deliverability, engagement and inbound trends across your Resend accounts."
      />
      <InsightsView
        orgSlug={orgSlug}
        initial={initial}
        initialDays={days}
        initialFilters={filters}
        options={options}
        canManageConnections={ctx.can("connection:create")}
      />
    </>
  );
}
