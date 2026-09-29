import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActivityView } from "@/components/activity/activity-view";
import { filtersFromSearch } from "@/components/activity/filters";
import { PageHeader } from "@/components/app/page-header";
import { getMailFilterOptions } from "@/components/inbox/data";
import { activityParams } from "@/components/inbox/api";
import { requireOrg } from "@/lib/dal";
import { listActivity } from "@/lib/services/emails";
import { activityQuery, toActivityInput } from "@/app/api/v1/_lib/queries";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/activity">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  if (!ctx.can("activity:read")) notFound();

  const initialFilters = filtersFromSearch(await searchParams);
  const options = await getMailFilterOptions(ctx);

  // Date filters depend on the browser's time zone, so the client fetches those itself.
  let initialPage = null;
  if (options.hasConnection && !initialFilters.from && !initialFilters.to) {
    const parsed = activityQuery.safeParse({ ...activityParams(initialFilters), limit: "50" });
    if (parsed.success) initialPage = await listActivity(ctx, toActivityInput(parsed.data));
  }

  return (
    <>
      <PageHeader
        title="Activity"
        description="Every email your accounts sent or received, with its full timeline."
      />
      <ActivityView
        orgSlug={orgSlug}
        initialFilters={initialFilters}
        initialPage={initialPage}
        hasConnection={options.hasConnection}
        canManageConnections={ctx.can("connection:create")}
        connections={options.connections}
        domains={options.domains}
      />
    </>
  );
}
