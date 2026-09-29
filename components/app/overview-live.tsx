"use client";

import type { InsightsDTO } from "@/lib/dto/insights";
import { useLiveQuery } from "@/lib/realtime/use-live-query";
import { topics } from "@/lib/realtime/topics";
import { fetchInsights, insightsKey } from "@/components/insights/api";
import { OverviewContent } from "./overview";
import { buildOverview } from "./overview-model";

/**
 * The overview as a live query: the server renders the first paint from `initial`, then every
 * processed email event (topic `emails`) refetches the 7 day insights and the KPI numbers roll.
 */
export function OverviewLive({
  orgSlug,
  userName,
  initial,
  hasConnection,
  canSeeInsights,
}: {
  orgSlug: string;
  userName?: string;
  initial: InsightsDTO | null;
  hasConnection: boolean;
  canSeeInsights: boolean;
}) {
  const query = useLiveQuery({
    queryKey: insightsKey(orgSlug, 7, {}),
    queryFn: () => fetchInsights(orgSlug, 7, {}),
    topics: [topics.insights()],
    initialData: initial ?? undefined,
    enabled: canSeeInsights && hasConnection,
  });
  const overview = buildOverview(query.data ?? initial, hasConnection, canSeeInsights);
  return <OverviewContent orgSlug={orgSlug} overview={overview} userName={userName} />;
}
