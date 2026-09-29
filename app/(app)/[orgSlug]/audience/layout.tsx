import { notFound } from "next/navigation";

import { AudienceNav } from "@/components/audience/audience-nav";
import { requireOrg } from "@/lib/dal";

export default async function AudienceLayout({
  children,
  params,
}: LayoutProps<"/[orgSlug]/audience">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  if (!ctx.can("contact:read")) notFound();
  return (
    <div className="grid gap-5">
      <AudienceNav orgSlug={orgSlug} showManage={ctx.can("audience:read")} />
      {children}
    </div>
  );
}
