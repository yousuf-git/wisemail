import type { Metadata } from "next";

import { getOverview } from "@/components/app/overview-data";
import { OverviewContent } from "@/components/app/overview";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ params }: PageProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const overview = await getOverview(orgSlug);
  return <OverviewContent orgSlug={orgSlug} overview={overview} />;
}
