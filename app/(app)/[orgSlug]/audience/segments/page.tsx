import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { SegmentsView } from "@/components/audience/segments-view";
import { requireOrg } from "@/lib/dal";
import { listConnectionOptions } from "@/lib/services/audience-shared";
import { listSegments } from "@/lib/services/segments";

export const metadata: Metadata = { title: "Segments" };

export default async function SegmentsPage({ params }: PageProps<"/[orgSlug]/audience/segments">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  if (!ctx.can("audience:read")) notFound();
  const [segments, connections] = await Promise.all([
    listSegments(ctx),
    listConnectionOptions(ctx),
  ]);
  return (
    <>
      <PageHeader title="Segments" description="Groups of contacts you can send a broadcast to." />
      <SegmentsView
        orgSlug={orgSlug}
        segments={segments}
        connections={connections}
        canManage={ctx.can("audience:manage")}
      />
    </>
  );
}
