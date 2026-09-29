import { AppShell } from "@/components/app/app-shell";
import { requireOrg } from "@/lib/dal";

export default async function OrgLayout({ children, params }: LayoutProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const { org, orgs, user, role } = await requireOrg(orgSlug);

  return (
    <AppShell
      org={org}
      orgs={orgs}
      user={{ name: user.name, email: user.email, image: user.image }}
      role={role}
    >
      {children}
    </AppShell>
  );
}
