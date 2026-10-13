import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { SETTINGS_SECTIONS } from "@/components/app/settings-nav";

/** Placeholder for settings sections that land in later phases. `connections` has its own page. */
export async function generateMetadata({
  params,
}: PageProps<"/[orgSlug]/settings/[section]">): Promise<Metadata> {
  const { section } = await params;
  return { title: SETTINGS_SECTIONS.find((s) => s.slug === section)?.label ?? "Settings" };
}

export default async function SettingsSectionPage({
  params,
}: PageProps<"/[orgSlug]/settings/[section]">) {
  const { section } = await params;
  const entry = SETTINGS_SECTIONS.find((s) => s.slug === section);
  if (!entry) notFound();
  return (
    <>
      <PageHeader title={entry.label} />
      <EmptyState title="Coming soon" mood="thinking">
        {entry.label} settings are on the way. For now, head to Connections to link your Resend
        account.
      </EmptyState>
    </>
  );
}
