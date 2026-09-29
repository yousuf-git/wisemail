"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { label: "Contacts", path: "contacts" },
  { label: "Segments", path: "segments" },
  { label: "Topics", path: "topics" },
  { label: "Properties", path: "properties" },
] as const;

/** Sub-navigation of the Audience section. Tabs hidden for roles without `audience:read` are not passed in. */
export function AudienceNav({ orgSlug, showManage }: { orgSlug: string; showManage: boolean }) {
  const pathname = usePathname();
  const base = `/${orgSlug}/audience`;
  const tabs = showManage ? TABS : TABS.filter((t) => t.path === "contacts");
  if (tabs.length < 2) return null;
  return (
    <nav
      aria-label="Audience"
      className="flex w-fit flex-wrap gap-1 rounded-full bg-canvas-sunken p-1"
    >
      {tabs.map((tab) => {
        const href = `${base}/${tab.path}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.path}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold text-ink-secondary transition-colors duration-150 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent",
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
