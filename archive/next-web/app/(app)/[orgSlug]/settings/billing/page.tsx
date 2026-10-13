import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { BillingView } from "@/components/billing/billing-view";
import { requireOrg } from "@/lib/dal";
import { getBillingOverview } from "@/lib/services/plan-changes";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({ params }: PageProps<"/[orgSlug]/settings/billing">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const header = (
    <PageHeader title="Billing" description="Your plan, trial and what each tier includes." />
  );
  if (!ctx.can("billing:read")) {
    return (
      <>
        {header}
        <EmptyState title="Billing is managed by the Owner" mood="idle">
          Ask your workspace Owner if you need a different plan.
        </EmptyState>
      </>
    );
  }
  const overview = await getBillingOverview(ctx);
  return (
    <>
      {header}
      <BillingView orgSlug={orgSlug} overview={overview} />
    </>
  );
}
