import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

export const SETTINGS_SECTIONS = [
  { slug: "general", label: "General", to: "/$orgSlug/settings/general" as const },
  { slug: "members", label: "Members", to: "/$orgSlug/settings/members" as const },
  { slug: "projects", label: "Projects", to: "/$orgSlug/settings/projects" as const },
  { slug: "connections", label: "Connections", to: "/$orgSlug/settings/connections" as const },
  { slug: "senders", label: "Senders", to: "/$orgSlug/settings/senders" as const },
  {
    slug: "notifications",
    label: "Notifications",
    to: "/$orgSlug/settings/notifications" as const,
  },
  { slug: "cleanup", label: "Cleanup", to: "/$orgSlug/settings/cleanup" as const },
  { slug: "ai", label: "AI", to: "/$orgSlug/settings/ai" as const },
  { slug: "usage", label: "Usage", to: "/$orgSlug/settings/usage" as const },
  { slug: "billing", label: "Billing", to: "/$orgSlug/settings/billing" as const },
  { slug: "audit", label: "Audit log", to: "/$orgSlug/settings/audit" as const },
] as const;

/** Section nav for settings: side list on wide screens, scrolling row on narrow ones. */
export function SettingsNav({ orgSlug }: { orgSlug: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const base = `/${orgSlug}/settings`;

  return (
    <nav
      aria-label="Settings"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 min-[900px]:mx-0 min-[900px]:grid min-[900px]:content-start min-[900px]:gap-0.5 min-[900px]:overflow-visible min-[900px]:px-0 min-[900px]:pb-0"
    >
      {SETTINGS_SECTIONS.map(({ slug, label, to }) => {
        const href = `${base}/${slug}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={slug}
            to={to}
            params={{ orgSlug }}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-[10px] px-3 py-1.5 text-[0.84rem] font-medium whitespace-nowrap text-ink-secondary transition-colors duration-150 outline-none hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-accent",
              active && "bg-accent-soft font-semibold text-ink hover:bg-accent-soft",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
