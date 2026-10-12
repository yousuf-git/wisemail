import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { UsageView } from "@/components/usage/usage-view";
import { requireOrg } from "@/lib/dal";
import { getUsageOverview } from "@/lib/services/usage";

export const metadata: Metadata = { title: "Usage" };

export default async function UsagePage({ params }: PageProps<"/[orgSlug]/settings/usage">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const header = (
    <PageHeader
      title="Usage"
      description="Tracked emails against your allowance, AI credits, and what your plan includes."
    />
  );
  if (!ctx.can("usage:read")) {
    return (
      <>
        {header}
        <EmptyState title="Usage is for Owners and Admins" mood="idle">
          Ask an Owner or Admin if you need to see how much of the plan is used.
        </EmptyState>
      </>
    );
  }
  const usage = await getUsageOverview(ctx);
  return (
    <>
      {header}
      <UsageView usage={usage} orgSlug={orgSlug} isOwner={ctx.can("billing:manage")} />
    </>
  );
}
