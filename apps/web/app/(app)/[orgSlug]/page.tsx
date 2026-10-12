import type { Metadata } from "next";

import { OverviewLive } from "@/components/app/overview-live";
import { getOverview } from "@/components/app/overview-data";
import { requireOrg } from "@/lib/dal";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ params }: PageProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const { insights, overview, canSeeInsights } = await getOverview(ctx);
  return (
    <OverviewLive
      orgSlug={orgSlug}
      userName={ctx.user.name}
      initial={insights}
      hasConnection={overview.hasConnection}
      canSeeInsights={canSeeInsights}
    />
  );
}
