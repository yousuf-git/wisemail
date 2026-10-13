import { Link } from "@tanstack/react-router";
import { LogOut, PenLine } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { NavLinks } from "@/components/shell/nav-links";
import { NotificationBell } from "@/components/shell/notification-bell";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export type ShellOrg = { id: string; name: string; slug: string };
export type ShellUser = { name: string; email: string; image?: string | null };

export function AppShell({
  org,
  orgs,
  user,
  children,
}: {
  org: ShellOrg;
  orgs: ShellOrg[];
  user: ShellUser;
  children: React.ReactNode;
}) {
  return (
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
          className="sticky top-0 hidden h-dvh self-start border-r border-line bg-surface px-2.5 py-3 min-[1000px]:block"
        >
          <Dock org={org} orgs={orgs} user={user} />
        </aside>
        <div className="flex min-h-dvh min-w-0 flex-col">
          <div className="sticky top-0 z-30 flex h-[var(--shell-topbar-height)] items-center justify-between gap-3 border-b border-line/80 bg-canvas/90 px-[var(--shell-gutter-mobile)] backdrop-blur-md min-[1000px]:px-[var(--shell-gutter)]">
            <p className="truncate text-sm font-semibold">{org.name}</p>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <NotificationBell orgSlug={org.slug} />
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
  );
}

function Dock({
  org,
  orgs,
  user,
}: {
  org: ShellOrg;
  orgs: ShellOrg[];
  user: ShellUser;
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
            window.location.assign(`/${slug}/inbox`);
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
        <PenLine size={16} aria-hidden />
        Compose
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NavLinks orgSlug={org.slug} />
      </div>
      <div className="grid gap-2 border-t border-line pt-2">
        <div className="px-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-ink-muted">{user.email}</p>
        </div>
        <button
          type="button"
          className={cn(
            "flex h-9 items-center justify-center gap-2 rounded-control border border-line px-3 text-sm font-medium",
            "text-ink-secondary hover:bg-canvas-sunken hover:text-ink",
          )}
          onClick={async () => {
            await authClient.signOut();
            window.location.assign("/sign-in");
          }}
        >
          <LogOut size={16} aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );
}
