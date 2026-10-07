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
 * App chrome: edge-flush sidebar dock (sheet below 1000px), compact top bar, full-bleed main.
 * Sizes come from shell tokens in globals.css.
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
            className="sr-only rounded-control bg-surface px-3 py-2 font-semibold shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
          >
            Skip to content
          </a>
          <div className="grid min-h-dvh w-full grid-cols-1 min-[1000px]:grid-cols-[var(--shell-dock-width)_minmax(0,1fr)]">
            <aside
              aria-label="Sidebar"
              data-tour="nav"
              className="sticky top-0 hidden h-dvh self-start border-r border-line bg-surface px-2.5 py-3 min-[1000px]:block"
            >
              <Dock {...dockProps} />
            </aside>
            <div className="flex min-h-dvh min-w-0 flex-col">
              <div className="sticky top-0 z-30 border-b border-line/80 bg-canvas/90 px-[var(--shell-gutter-mobile)] backdrop-blur-md supports-[backdrop-filter]:bg-canvas/75 min-[1000px]:px-[var(--shell-gutter)]">
                <div className="flex h-[var(--shell-topbar-height)] items-center">
                  <Topbar
                    orgName={org.name}
                    orgSlug={org.slug}
                    orgId={org.id}
                    userId={user.id}
                    unreadNotifications={unreadNotifications}
                    dock={<Dock {...dockProps} footerSlot={<MobileTheme />} />}
                  />
                </div>
              </div>
              <main
                id="main"
                className="mx-auto flex w-full min-w-0 flex-1 flex-col gap-3 px-[var(--shell-gutter-mobile)] py-3 min-[1000px]:px-[var(--shell-gutter)] min-[1000px]:py-4"
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
