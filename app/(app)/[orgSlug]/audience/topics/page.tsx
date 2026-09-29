import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { TopicsView } from "@/components/audience/topics-view";
import { requireOrg } from "@/lib/dal";
import { listConnectionOptions } from "@/lib/services/audience-shared";
import { listTopics } from "@/lib/services/topics";

export const metadata: Metadata = { title: "Topics" };

export default async function TopicsPage({ params }: PageProps<"/[orgSlug]/audience/topics">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  if (!ctx.can("audience:read")) notFound();
  const [topics, connections] = await Promise.all([listTopics(ctx), listConnectionOptions(ctx)]);
  return (
    <>
      <PageHeader title="Topics" description="Kinds of email people can choose to receive." />
      <TopicsView
        orgSlug={orgSlug}
        topics={topics}
        connections={connections}
        canManage={ctx.can("audience:manage")}
      />
    </>
  );
}
