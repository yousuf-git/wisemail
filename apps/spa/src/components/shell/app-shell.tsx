import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, PenLine, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { getUsageSummary } from "@/lib/api";
import { SmoothScroll } from "@/components/marketing/smooth-scroll";
import { TourMenu } from "@/components/tour/tour-menu";
import { NavLinks } from "@/components/shell/nav-links";
import { NotificationBell } from "@/components/shell/notification-bell";
import { Breadcrumbs, SearchPill } from "@/components/shell/topbar-chrome";
import { UserMenu } from "@/components/shell/user-menu";
import { PlanBanner, UsageTile } from "@/components/shell/usage-tile";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export type ShellOrg = { id: string; name: string; slug: string };
export type ShellUser = { name: string; email: string; image?: string | null };

export function AppShell({
  org,
  orgs,
  user,
  children,
  /** When set, skip live usage fetch (dev shell-preview). */
  usageOverride,
}: {
  org: ShellOrg;
  orgs: ShellOrg[];
  user: ShellUser;
  children: React.ReactNode;
  usageOverride?: import("@/lib/api").UsageSummary | null;
}) {
  const [mobileNav, setMobileNav] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const usage = useQuery({
    queryKey: ["usage-summary", org.slug],
    queryFn: () => getUsageSummary(org.slug),
    staleTime: 60_000,
    enabled: usageOverride === undefined,
  });
  const usageData = usageOverride === undefined ? usage.data : usageOverride ?? undefined;

  useEffect(() => {
    setMobileNav(false);
  }, [pathname]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (mobileNav && !el.open) el.showModal();
    if (!mobileNav && el.open) el.close();
  }, [mobileNav]);

  return (
    <SmoothScroll>
    <div className="min-h-dvh bg-canvas text-ink">
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
          <Dock org={org} orgs={orgs} user={user} usage={usageData} />
        </aside>
        <div className="flex min-h-dvh min-w-0 flex-col">
          <div className="sticky top-0 z-30 flex h-[var(--shell-topbar-height)] items-center gap-2.5 border-b border-line/80 bg-canvas/90 px-[var(--shell-gutter-mobile)] backdrop-blur-md min-[1000px]:px-[var(--shell-gutter)]">
            <button
              type="button"
              data-tour="nav-button"
              aria-label="Open navigation"
              className="grid size-8 shrink-0 place-items-center rounded-control bg-surface text-ink-secondary ring-1 ring-line outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent min-[1000px]:hidden"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={18} aria-hidden />
            </button>
            <Breadcrumbs orgName={org.name} orgSlug={org.slug} />
            <div className="ml-auto flex shrink-0 items-center gap-2.5">
              <SearchPill orgSlug={org.slug} />
              <TourMenu className="hidden min-[420px]:grid" />
              <ThemeToggle className="hidden md:inline-flex" />
              <NotificationBell orgSlug={org.slug} />
            </div>
          </div>
          <dialog
            ref={dialogRef}
            aria-labelledby={titleId}
            className="fixed inset-y-0 left-0 m-0 h-dvh w-[min(85vw,var(--shell-dock-width))] max-w-none translate-x-0 rounded-none border-0 bg-surface p-2.5 shadow-xl open:flex open:flex-col backdrop:bg-ink/40 min-[1000px]:hidden"
            onClose={() => setMobileNav(false)}
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <h2 id={titleId} className="text-sm font-semibold">
                Navigation
              </h2>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setMobileNav(false)}
                className="grid size-8 place-items-center rounded-control text-ink-secondary hover:bg-canvas-sunken hover:text-ink"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Dock org={org} orgs={orgs} user={user} usage={usageData} />
            </div>
          </dialog>
          <main
            id="main"
            className="mx-auto flex w-full min-w-0 flex-1 flex-col gap-3 px-[var(--shell-gutter-mobile)] py-3 min-[1000px]:px-[var(--shell-gutter)] min-[1000px]:py-4"
          >
            {usageData?.banner ? <PlanBanner banner={usageData.banner} /> : null}
            {children}
          </main>
        </div>
      </div>
    </div>
    </SmoothScroll>
  );
}

function Dock({
  org,
  orgs,
  user,
  usage,
}: {
  org: ShellOrg;
  orgs: ShellOrg[];
  user: ShellUser;
  usage?: import("@/lib/api").UsageSummary;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      <div className="grid gap-1">
        <p className="truncate px-1 text-sm font-semibold tracking-tight">Wisemail</p>
        <label className="sr-only" htmlFor="org-switcher">
          Workspace
        </label>
        <select
          id="org-switcher"
          className="h-9 w-full rounded-control border border-line bg-canvas-sunken px-2 text-sm"
          value={org.slug}
          onChange={(e) => {
            const slug = e.target.value;
            window.location.assign(`/${slug}`);
          }}
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.slug}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <Link
        to="/$orgSlug/compose"
        params={{ orgSlug: org.slug }}
        className="flex h-9 items-center justify-center gap-2 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink transition-[transform,background-color] duration-150 hover:bg-accent-fill-hover active:scale-[0.97]"
      >
        <PenLine size={16} aria-hidden className="transition-transform duration-200 group-hover:rotate-12" />
        Compose
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NavLinks orgSlug={org.slug} />
      </div>
      <UsageTile orgSlug={org.slug} usage={usage} />
      <div className="border-t border-line pt-2">
        <UserMenu user={user} orgSlug={org.slug} />
      </div>
    </div>
  );
}
