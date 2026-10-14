import { Navigate, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminMe } from "@/lib/admin-api";
import { authClient } from "@/lib/auth/client";

/** Platform admin chrome. Non-admins see the same empty state as a missing route. */
export function AdminLayoutPage() {
  const session = authClient.useSession();
  const me = useQuery({
    queryKey: ["admin-me"],
    queryFn: getAdminMe,
    enabled: !!session.data?.user,
    retry: false,
  });

  if (session.isPending || (session.data?.user && me.isPending)) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas text-sm text-ink-muted">
        Loading…
      </div>
    );
  }

  if (!session.data?.user) {
    return <Navigate to="/sign-in" search={{ next: "/admin" }} />;
  }

  if (me.isError || !me.data) {
    return <Navigate to="/" />;
  }

  return (
    <>
      <ImpersonationBanner />
      <AdminShell admin={me.data}>
        <Outlet />
      </AdminShell>
    </>
  );
}
