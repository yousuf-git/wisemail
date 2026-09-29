import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { GeneralForm } from "@/components/billing/general-form";
import { requireOrg } from "@/lib/dal";
import { getGeneralSettings } from "@/lib/services/general-settings";

export const metadata: Metadata = { title: "General" };

export default async function GeneralPage({ params }: PageProps<"/[orgSlug]/settings/general">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const header = (
    <PageHeader
      title="General"
      description="The workspace name, its address and the time zone used for daily numbers and digests."
    />
  );
  if (!ctx.can("organization:update")) {
    return (
      <>
        {header}
        <EmptyState title="General settings are for Owners and Admins" mood="idle">
          Ask an Owner or Admin to rename the workspace or change its time zone.
        </EmptyState>
      </>
    );
  }
  const settings = await getGeneralSettings(ctx);
  return (
    <>
      {header}
      <GeneralForm
        orgSlug={orgSlug}
        initial={settings}
        canDelete={ctx.can("organization:delete")}
      />
    </>
  );
}
