import type { Metadata } from "next";

import { Panel } from "@/components/admin/admin-ui";
import { PageHeader } from "@/components/app/page-header";
import { requirePlatformAdmin } from "@/lib/admin/guard";
import { getAdminCatalog } from "@/lib/services/admin/catalog";
import { env } from "@/lib/env";

import { PricingForms } from "./pricing-forms";

export const metadata: Metadata = { title: "Pricing" };

export default async function AdminPricingPage() {
  await requirePlatformAdmin();
  const { catalog, recentChanges } = await getAdminCatalog();
  const paid = catalog.plans.filter((p) => p.id !== "free");

  return (
    <>
      <PageHeader
        title="Pricing"
        description={
          env.BILLING_ENABLED
            ? "Change plan amounts. Wisemail creates a new Stripe price, archives the old one, and moves subscribers at their next renewal."
            : "Billing is off — amounts update the catalog only (no Stripe prices)."
        }
      />
      <PricingForms plans={paid} billingEnabled={env.BILLING_ENABLED} />
      <Panel title="Recent price changes" description="Migration status for catalog updates.">
        {recentChanges.length === 0 ? (
          <p className="text-sm text-ink-muted">No price changes yet.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {recentChanges.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-canvas-sunken px-3 py-2"
              >
                <span>
                  <b className="font-semibold capitalize">{c.plan}</b> ({c.interval}){" "}
                  ${c.oldAmountUsd} → ${c.newAmountUsd}
                </span>
                <span className="text-ink-muted">
                  {c.status}
                  {c.migratedCount ? ` · ${c.migratedCount} migrated` : ""}
                  {c.failedCount ? ` · ${c.failedCount} failed` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
