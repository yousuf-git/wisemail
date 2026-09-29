import { BreadcrumbProvider } from "./breadcrumb-label";
import { Dock } from "./dock";
import { MotionProvider } from "./motion-provider";
import { Topbar } from "./topbar";
import { MobileTheme } from "./mobile-theme";
import type { UsageSummary } from "./usage-tile";

export type AppShellProps = {
  org: { id: string; name: string; slug: string };
  orgs: { id: string; name: string; slug: string }[];
  user: { id?: string; name: string; email: string; image?: string | null };
  role: string;
  children: React.ReactNode;
  /** Plan, connection health and allowance for the dock tile. Omit for the neutral empty state. */
  usage?: UsageSummary;
  unreadNotifications?: number;
};

/**
 * App chrome: floating sidebar dock (a sheet below 1000px), top bar and content well.
 * Server-renderable; only the nav highlight, menus and top bar hydrate.
 */
export function AppShell({
  org,
  orgs,
  user,
  role,
  children,
  usage,
  unreadNotifications,
}: AppShellProps) {
  const dockProps = { org, orgs, user, role, usage };
  return (
    <MotionProvider>
      <BreadcrumbProvider>
      <div className="min-h-dvh bg-canvas">
        <a
          href="#main"
          className="sr-only rounded-md bg-surface px-3 py-2 font-semibold shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to content
        </a>
        <div className="mx-auto grid min-h-dvh w-full max-w-[1600px] grid-cols-1 gap-3.5 p-4 min-[1000px]:grid-cols-[240px_minmax(0,1fr)] min-[1000px]:p-3">
          <aside
            aria-label="Sidebar"
            className="sticky top-3 hidden h-[calc(100dvh-1.5rem)] self-start rounded-xl bg-surface p-3 shadow-md min-[1000px]:block"
          >
            <Dock {...dockProps} />
          </aside>
          <div className="flex min-w-0 flex-col gap-3.5">
            <Topbar
              orgName={org.name}
              orgSlug={org.slug}
              orgId={org.id}
              userId={user.id}
              unreadNotifications={unreadNotifications}
              dock={<Dock {...dockProps} footerSlot={<MobileTheme />} />}
            />
            <main
              id="main"
              className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-1 flex-col gap-3.5"
            >
              {children}
            </main>
          </div>
        </div>
      </div>
      </BreadcrumbProvider>
    </MotionProvider>
  );
}
