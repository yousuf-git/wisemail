import { AppShell } from "@/components/app/app-shell";
import { LiveProvider } from "@/components/app/live-provider";
import { QueryProvider } from "@/components/app/query-provider";
import { requireOrg } from "@/lib/dal";
import { getUnreadCount } from "@/lib/services/notifications";
import { getUsageSummary } from "@/lib/services/usage";

export default async function OrgLayout({ children, params }: LayoutProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const { org, orgs, user, role } = ctx;
  const [usage, unreadNotifications] = await Promise.all([
    getUsageSummary(ctx),
    getUnreadCount(ctx),
  ]);

  return (
    <QueryProvider>
      <LiveProvider orgSlug={org.slug}>
        <AppShell
          org={org}
          orgs={orgs}
          user={{ id: user.id, name: user.name, email: user.email, image: user.image }}
          role={role}
          usage={usage}
          unreadNotifications={unreadNotifications}
        >
          {children}
        </AppShell>
      </LiveProvider>
    </QueryProvider>
  );
}
