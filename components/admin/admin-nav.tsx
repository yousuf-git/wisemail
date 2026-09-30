"use client";

import { Activity, Building2, LayoutDashboard, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/admin/health", label: "System health", icon: Activity },
] as const;

/** Sidebar on wide screens, a wrapping row of pills below 900px. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex flex-wrap gap-1 min-[900px]:grid min-[900px]:gap-0.5">
      {ITEMS.map(({ href, label, icon: Icon, ...rest }) => {
        const active = "exact" in rest ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-[0.84rem] font-medium whitespace-nowrap text-ink-secondary transition-colors outline-none hover:bg-canvas hover:text-ink focus-visible:ring-2 focus-visible:ring-accent",
              active && "bg-accent-soft font-semibold text-ink hover:bg-accent-soft",
            )}
          >
            <Icon className={cn("size-[18px]", active && "text-accent-fill")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
