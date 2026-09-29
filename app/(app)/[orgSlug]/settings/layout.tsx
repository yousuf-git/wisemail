import { SettingsNav } from "@/components/app/settings-nav";

export default async function SettingsLayout({
  children,
  params,
}: LayoutProps<"/[orgSlug]/settings">) {
  const { orgSlug } = await params;
  return (
    <div className="grid gap-5 min-[900px]:grid-cols-[180px_minmax(0,1fr)] min-[900px]:gap-8">
      <SettingsNav orgSlug={orgSlug} />
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </div>
  );
}
