import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { requirePlatformAdmin } from "@/lib/admin/guard";
import { getPlatformCatalog } from "@/lib/services/catalog";

import { PlatformSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Platform settings" };

export default async function AdminPlatformSettingsPage() {
  await requirePlatformAdmin();
  const catalog = await getPlatformCatalog();

  return (
    <>
      <PageHeader
        title="Platform"
        description="Trial length, grace periods, credit packs, AI models, system from-address, and feature toggles. Secrets stay in environment variables."
      />
      <PlatformSettingsForm catalog={catalog} />
    </>
  );
}
