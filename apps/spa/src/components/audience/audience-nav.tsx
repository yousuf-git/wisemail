import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

const TABS = [
  { label: "Contacts", path: "contacts" },
  { label: "Segments", path: "segments" },
  { label: "Topics", path: "topics" },
  { label: "Properties", path: "properties" },
] as const;

export function AudienceNav({ orgSlug }: { orgSlug: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const base = `/${orgSlug}/audience`;

  return (
    <nav
      aria-label="Audience"
      className="flex w-fit flex-wrap gap-1 rounded-full bg-canvas-sunken p-1"
    >
      {TABS.map((tab) => {
        const href = `${base}/${tab.path}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.path}
            to={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold text-ink-secondary transition-colors outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent",
              active && "bg-surface text-ink shadow-sm",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
