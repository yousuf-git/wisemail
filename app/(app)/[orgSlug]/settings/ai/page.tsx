import type { Metadata } from "next";

import { AiSettings } from "@/components/ai/ai-settings";
import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/dal";
import { getAiStatus, getAiUsage } from "@/lib/services/ai-settings";

export const metadata: Metadata = { title: "AI settings" };

export default async function AiSettingsPage({ params }: PageProps<"/[orgSlug]/settings/ai">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const [status, usage] = await Promise.all([
    getAiStatus(ctx),
    ctx.can("ai:configure") ? getAiUsage(ctx) : null,
  ]);
  return (
    <>
      <PageHeader
        title="AI assist"
        description="Wizi can summarize inbound mail, draft replies, polish what you write and explain alerts. Suggestions only: nothing is sent or changed without you."
      />
      <AiSettings orgSlug={orgSlug} status={status} usage={usage} />
    </>
  );
}
