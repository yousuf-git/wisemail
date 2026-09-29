"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export const SETTINGS_SECTIONS = [
  { slug: "general", label: "General" },
  { slug: "members", label: "Members" },
  { slug: "projects", label: "Projects" },
  { slug: "connections", label: "Connections" },
  { slug: "senders", label: "Senders" },
  { slug: "notifications", label: "Notifications" },
  { slug: "ai", label: "AI" },
  { slug: "usage", label: "Usage" },
  { slug: "billing", label: "Billing" },
  { slug: "audit-log", label: "Audit log" },
] as const;

/** Section nav for settings: a side list on wide screens, a scrolling row on narrow ones. */
export function SettingsNav({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Settings"
      className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 min-[900px]:mx-0 min-[900px]:grid min-[900px]:content-start min-[900px]:gap-0.5 min-[900px]:overflow-visible min-[900px]:px-0 min-[900px]:pb-0"
    >
      {SETTINGS_SECTIONS.map(({ slug, label }) => {
        const href = `/${orgSlug}/settings/${slug}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={slug}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-[10px] px-3 py-1.5 text-[0.84rem] font-medium whitespace-nowrap text-ink-secondary transition-colors duration-150 ease-soft outline-none hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-accent",
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
