import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useParams } from "@tanstack/react-router";

import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { BreadcrumbProvider } from "@/components/app/breadcrumb-label";
import { AppShell } from "@/components/shell/app-shell";
import { TourProvider } from "@/components/tour/tour-provider";
import { useOrgStream } from "@/hooks/use-org-stream";
import { ApiError, getTourBootstrap } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

export function OrgLayoutPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const session = authClient.useSession();
  const orgsQuery = authClient.useListOrganizations();

  useOrgStream(orgSlug, session.data?.user?.id);

  const tours = useQuery({
    queryKey: ["tours", orgSlug],
    queryFn: () => getTourBootstrap(orgSlug),
    enabled: !!session.data?.user,
    retry: false,
  });

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

  if (tours.isError && tours.error instanceof ApiError && tours.error.code === "workspace_suspended") {
    return <Navigate to="/suspended/$orgSlug" params={{ orgSlug }} />;
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
  const bootstrap = tours.data ?? { tours: [], hasConnection: false };

  return (
    <>
      <ImpersonationBanner />
      <TourProvider orgSlug={org.slug} bootstrap={bootstrap}>
        <BreadcrumbProvider>
          <AppShell
            org={org}
            orgs={orgs}
            user={{ name: user.name, email: user.email, image: user.image }}
          >
            <Outlet />
          </AppShell>
        </BreadcrumbProvider>
      </TourProvider>
    </>
  );
}
