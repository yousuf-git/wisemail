import { AppShell } from "@/components/app/app-shell";
import { requireOrg } from "@/lib/dal";
import { getUsageSummary } from "@/lib/services/usage";

export default async function OrgLayout({ children, params }: LayoutProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const { org, orgs, user, role } = ctx;
  const usage = await getUsageSummary(ctx);

  return (
    <AppShell
      org={org}
      orgs={orgs}
      user={{ name: user.name, email: user.email, image: user.image }}
      role={role}
      usage={usage}
    >
      {children}
    </AppShell>
  );
}
