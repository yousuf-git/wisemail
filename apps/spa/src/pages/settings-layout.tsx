import { Navigate, Outlet, useParams, useRouterState } from "@tanstack/react-router";

import { SettingsNav } from "@/components/shell/settings-nav";

export function SettingsLayoutPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings" });
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname === `/${orgSlug}/settings` || pathname === `/${orgSlug}/settings/`) {
    return <Navigate to="/$orgSlug/settings/general" params={{ orgSlug }} />;
  }

  return (
    <div className="grid gap-5 min-[900px]:grid-cols-[180px_minmax(0,1fr)] min-[900px]:gap-8">
      <SettingsNav orgSlug={orgSlug} />
      <div className="flex min-w-0 flex-col gap-5">
        <Outlet />
      </div>
    </div>
  );
}
