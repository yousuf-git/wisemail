import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IncidentDetail } from "@/components/alerts/incident-detail";
import { BreadcrumbLabel } from "@/components/app/breadcrumb-label";
import { LiveRefresh } from "@/components/app/live-refresh";
import { requireOrg } from "@/lib/dal";
import { topics } from "@/lib/realtime/topics";
import { getIncident } from "@/lib/services/alerts";

export const metadata: Metadata = { title: "Incident" };

export default async function IncidentPage({
  params,
}: PageProps<"/[orgSlug]/alerts/incidents/[incidentId]">) {
  const { orgSlug, incidentId } = await params;
  const ctx = await requireOrg(orgSlug);
  if (!ctx.can("alertRule:read")) notFound();
  const incident = await getIncident(ctx, incidentId);
  if (!incident) notFound();
  return (
    <>
      <BreadcrumbLabel segment={incidentId} label={incident.title} />
      <LiveRefresh topics={[topics.incidents(ctx.org.id)]} />
      <IncidentDetail
        orgSlug={orgSlug}
        incident={incident}
        canAcknowledge={ctx.can("alertRule:update")}
      />
    </>
  );
}
