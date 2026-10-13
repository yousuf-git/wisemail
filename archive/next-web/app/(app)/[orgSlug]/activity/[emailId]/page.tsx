import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BreadcrumbLabel } from "@/components/app/breadcrumb-label";
import { EmailDetail } from "@/components/activity/email-detail";
import { getMailFilterOptions } from "@/components/inbox/data";
import { requireOrg } from "@/lib/dal";
import { getEmailTimeline } from "@/lib/services/emails";
import { ServiceError } from "@/lib/services/errors";

export const metadata: Metadata = { title: "Email" };

export default async function EmailDetailPage({
  params,
}: PageProps<"/[orgSlug]/activity/[emailId]">) {
  const { orgSlug, emailId } = await params;
  const ctx = await requireOrg(orgSlug);
  if (!ctx.can("activity:read")) notFound();

  const timeline = await getEmailTimeline(ctx, emailId).catch((error) => {
    if (error instanceof ServiceError && error.code === "not_found") return notFound();
    throw error;
  });
  const options = await getMailFilterOptions(ctx);
  const domain = timeline.email.domainId
    ? options.domains.find((d) => d.id === timeline.email.domainId)
    : undefined;

  return (
    <>
      <BreadcrumbLabel segment={emailId} label={timeline.email.subject || "(no subject)"} />
      <EmailDetail
        orgSlug={orgSlug}
        timeline={timeline}
        connectionName={
          options.connections.find((c) => c.id === timeline.email.connectionId)?.name ?? null
        }
        domainName={domain?.name ?? null}
        canOpenThread={ctx.can("thread:read")}
      />
    </>
  );
}
