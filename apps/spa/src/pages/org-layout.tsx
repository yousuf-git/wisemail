import { Navigate, Outlet, useParams } from "@tanstack/react-router";

import { AppShell } from "@/components/shell/app-shell";
import { useOrgStream } from "@/hooks/use-org-stream";
import { authClient } from "@/lib/auth/client";

export function OrgLayoutPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const session = authClient.useSession();
  const orgsQuery = authClient.useListOrganizations();

  useOrgStream(orgSlug, session.data?.user?.id);

  if (session.isPending || orgsQuery.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas text-sm text-ink-muted">
        Loading workspace…
      </div>
    );
  }

  if (!session.data?.user) {
    return <Navigate to="/sign-in" search={{ next: `/${orgSlug}/inbox` }} />;
  }

  const orgs = (orgsQuery.data ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
  }));
  const org = orgs.find((o) => o.slug === orgSlug);
  if (!org) {
    return <Navigate to="/" />;
  }

  const user = session.data.user;
  return (
    <AppShell
      org={org}
      orgs={orgs}
      user={{ name: user.name, email: user.email, image: user.image }}
    >
      <Outlet />
    </AppShell>
  );
}
