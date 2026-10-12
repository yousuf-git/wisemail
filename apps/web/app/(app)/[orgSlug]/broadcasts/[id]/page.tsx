import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Types } from "mongoose";

import { BreadcrumbLabel } from "@/components/app/breadcrumb-label";
import { PageHeader } from "@/components/app/page-header";
import { BroadcastEditor } from "@/components/broadcasts/broadcast-editor";
import { requireOrg } from "@/lib/dal";
import { getBroadcast, getBroadcastFormOptions } from "@/lib/services/broadcasts";
import { ServiceError } from "@/lib/services/errors";
import { getOrgSettings } from "@/lib/services/org-settings";

export const metadata: Metadata = { title: "Broadcast" };

export default async function BroadcastPage({ params }: PageProps<"/[orgSlug]/broadcasts/[id]">) {
  const { orgSlug, id } = await params;
  const ctx = await requireOrg(orgSlug);
  if (!ctx.can("broadcast:read")) notFound();
  const broadcast = await getBroadcast(ctx, id).catch((error) => {
    if (error instanceof ServiceError && error.code === "not_found") return notFound();
    throw error;
  });
  const [options, settings] = await Promise.all([
    getBroadcastFormOptions(ctx),
    getOrgSettings(new Types.ObjectId(ctx.org.id)),
  ]);
  return (
    <>
      <BreadcrumbLabel segment={id} label={broadcast.name} />
      <PageHeader
        title={broadcast.name}
        description={[
          broadcast.segmentName ? `To ${broadcast.segmentName}` : "No segment yet",
          broadcast.connectionName,
        ].join(" · ")}
      />
      {/* Remount when the status changes; a draft keeps its own state and version while it is edited. */}
      <BroadcastEditor
        key={`${broadcast.id}:${broadcast.status}:${broadcast.scheduledAt ?? ""}`}
        orgSlug={orgSlug}
        broadcast={broadcast}
        options={options}
        can={{ create: ctx.can("broadcast:create"), send: ctx.can("broadcast:send") }}
        timeZone={settings?.timezone ?? "UTC"}
      />
    </>
  );
}
