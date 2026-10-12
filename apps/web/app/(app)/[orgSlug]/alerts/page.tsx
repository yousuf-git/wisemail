import type { Metadata } from "next";

import { AlertsView } from "@/components/alerts/alerts-view";
import { EmptyState } from "@/components/app/empty-state";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/dal";
import { topics } from "@/lib/realtime/topics";
import {
  getAlertQuota,
  getAlertScopeOptions,
  listAlertRules,
  listIncidents,
} from "@/lib/services/alerts";

export const metadata: Metadata = { title: "Alerts" };

export default async function AlertsPage({ params }: PageProps<"/[orgSlug]/alerts">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const header = (
    <PageHeader
      title="Alerts"
      description="Rules that watch your email health and tell you when something needs a look."
    />
  );
  if (!ctx.can("alertRule:read")) {
    return (
      <>
        {header}
        <EmptyState title="Alerts are for the people who run email" mood="idle">
          Your role can&apos;t see alert rules. You&apos;ll still get notified when something
          affects you. Ask an Owner or Admin if you need more.
        </EmptyState>
      </>
    );
  }
  const [rules, incidents, quota, scopeOptions] = await Promise.all([
    listAlertRules(ctx),
    listIncidents(ctx, { limit: 60 }),
    getAlertQuota(ctx),
    getAlertScopeOptions(ctx),
  ]);
  return (
    <>
      {header}
      <LiveRefresh topics={[topics.incidents(ctx.org.id)]} />
      <AlertsView
        orgSlug={orgSlug}
        incidents={incidents}
        rules={rules}
        quota={quota}
        scopeOptions={scopeOptions}
        can={{
          create: ctx.can("alertRule:create"),
          update: ctx.can("alertRule:update"),
          delete: ctx.can("alertRule:delete"),
        }}
        isOwner={ctx.role === "owner"}
      />
    </>
  );
}
