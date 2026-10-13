import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Types } from "mongoose";

import { PageHeader } from "@/components/app/page-header";
import { BroadcastEditor } from "@/components/broadcasts/broadcast-editor";
import { requireOrg } from "@/lib/dal";
import { getBroadcastFormOptions } from "@/lib/services/broadcasts";
import { getOrgSettings } from "@/lib/services/org-settings";

export const metadata: Metadata = { title: "New broadcast" };

export default async function NewBroadcastPage({ params }: PageProps<"/[orgSlug]/broadcasts/new">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  if (!ctx.can("broadcast:create")) notFound();
  const [options, settings] = await Promise.all([
    getBroadcastFormOptions(ctx),
    getOrgSettings(new Types.ObjectId(ctx.org.id)),
  ]);
  return (
    <>
      <PageHeader
        title="New broadcast"
        description="Pick who gets it, write it, preview it. Nothing is sent until you say so."
      />
      <BroadcastEditor
        orgSlug={orgSlug}
        broadcast={null}
        options={options}
        can={{ create: true, send: ctx.can("broadcast:send") }}
        timeZone={settings?.timezone ?? "UTC"}
      />
    </>
  );
}
