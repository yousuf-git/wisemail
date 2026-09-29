import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { AuditView } from "@/components/audit/audit-view";
import { Button } from "@/components/ui/button";
import { getEntitlements } from "@/lib/billing/entitlements";
import { minPlanFor, PLAN_LABELS } from "@/lib/billing/plans";
import { requireOrg } from "@/lib/dal";
import { getAuditFilters, listAuditLog } from "@/lib/services/audit-log-read";
import { Types } from "mongoose";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditLogPage({ params }: PageProps<"/[orgSlug]/settings/audit-log">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const header = (
    <PageHeader
      title="Audit log"
      description="Who changed what in this workspace. Secrets are never recorded."
    />
  );
  if (!ctx.can("auditLog:read")) {
    return (
      <>
        {header}
        <EmptyState title="The audit log is for Owners and Admins" mood="idle">
          Ask an Owner or Admin if you need to know who changed something.
        </EmptyState>
      </>
    );
  }
  const e = await getEntitlements(new Types.ObjectId(ctx.org.id));
  if (!e.features.auditLog) {
    const min = PLAN_LABELS[minPlanFor("auditLog")];
    return (
      <>
        {header}
        <EmptyState
          title={`The audit log is on ${min} and above`}
          mood="thinking"
          action={
            ctx.can("billing:manage") ? (
              <Button asChild className="font-bold">
                <Link href={`/${orgSlug}/settings/billing`}>See plans</Link>
              </Button>
            ) : null
          }
        >
          You are on {e.planLabel}. {ctx.can("billing:manage") ? "" : "Ask your Owner to upgrade."}
        </EmptyState>
      </>
    );
  }
  const [page, filters] = await Promise.all([listAuditLog(ctx, {}), getAuditFilters(ctx)]);
  return (
    <>
      {header}
      <AuditView orgSlug={orgSlug} initial={page} filters={filters} />
    </>
  );
}
