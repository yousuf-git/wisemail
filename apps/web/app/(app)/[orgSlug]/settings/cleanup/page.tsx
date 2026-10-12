import type { Metadata } from "next";

import { CleanupView } from "@/components/cleanup/cleanup-view";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { getMailFilterOptions } from "@/components/inbox/data";
import { requireOrg } from "@/lib/dal";
import { listCleanupRules } from "@/lib/deletion/rules";

export const metadata: Metadata = { title: "Cleanup" };

export default async function CleanupPage({ params }: PageProps<"/[orgSlug]/settings/cleanup">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const header = (
    <PageHeader
      title="Cleanup"
      description="Keep your mailbox tidy: archive or trash old mail automatically, and send mail from senders you never want to Trash. Trash is emptied after 30 days."
    />
  );
  if (!ctx.can("cleanupRule:manage")) {
    return (
      <>
        {header}
        <EmptyState title="Cleanup rules are for Owners, Admins and Developers" mood="idle">
          Ask an Owner or Admin if you need a rule.
        </EmptyState>
      </>
    );
  }
  const [rules, options] = await Promise.all([listCleanupRules(ctx), getMailFilterOptions(ctx)]);
  return (
    <>
      {header}
      <CleanupView
        orgSlug={orgSlug}
        rules={rules}
        connections={options.connections}
        canDelete={ctx.can("cleanupRule:manageDelete")}
      />
    </>
  );
}
