"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  ActivityIcon,
  BellIcon,
  ChartIcon,
  ClockIcon,
  GlobeIcon,
  InboxIcon,
  KeyIcon,
  MegaphoneIcon,
  SettingsIcon,
  SparklesIcon,
  UsersIcon,
} from "@/components/icons/animated";
import { cn } from "@/lib/utils";

type NavIcon = typeof InboxIcon;

type NavItem = {
  label: string;
  /** Path below `/<orgSlug>`. */
  path: string;
  icon: NavIcon;
  /** Extra path prefixes (below the org) that keep this item highlighted. */
  alsoActiveFor?: string[];
};

export const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Mail",
    items: [
      { label: "Inbox", path: "inbox", icon: InboxIcon },
      { label: "Scheduled", path: "scheduled", icon: ClockIcon },
      { label: "Activity", path: "activity", icon: ActivityIcon },
    ],
  },
  {
    label: "Audience",
    items: [
      {
        label: "Contacts",
        path: "audience/contacts",
        icon: UsersIcon,
        alsoActiveFor: ["audience"],
      },
      { label: "Broadcasts", path: "broadcasts", icon: MegaphoneIcon },
      { label: "Templates", path: "templates", icon: SparklesIcon },
    ],
  },
  {
    label: "Health",
    items: [
      { label: "Insights", path: "insights", icon: ChartIcon },
      { label: "Alerts", path: "alerts", icon: BellIcon },
      { label: "Domains", path: "domains", icon: GlobeIcon },
      { label: "API keys", path: "api-keys", icon: KeyIcon },
    ],
  },
];

const settingsItem: NavItem = {
  label: "Settings",
  path: "settings/general",
  icon: SettingsIcon,
  alsoActiveFor: ["settings"],
};

function isActive(pathname: string, base: string, item: NavItem) {
  const prefixes = [item.path, ...(item.alsoActiveFor ?? [])];
  return prefixes.some((p) => {
    const href = `${base}/${p}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  });
}

function NavLink({ base, item, active }: { base: string; item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={`${base}/${item.path}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-[0.84rem] font-medium text-ink-secondary transition-colors duration-150 ease-soft outline-none hover:bg-canvas hover:text-ink focus-visible:bg-canvas focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-accent",
        active && "bg-accent-soft font-semibold text-ink hover:bg-accent-soft",
      )}
    >
      <Icon size={18} className={cn(active && "text-accent-fill")} />
      {item.label}
    </Link>
  );
}

/** Grouped dock navigation. Client-only because the active item follows `usePathname`. */
export function NavLinks({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname();
  const base = `/${orgSlug}`;
  return (
    <nav aria-label="Main" className="grid gap-0.5">
      {navGroups.map((group) => (
        <div key={group.label} className="grid gap-0.5">
          <span className="px-2.5 pt-2.5 pb-1 text-[0.6875rem] font-semibold tracking-[0.06em] text-ink-muted uppercase">
            {group.label}
          </span>
          {group.items.map((item) => (
            <NavLink
              key={item.path}
              base={base}
              item={item}
              active={isActive(pathname, base, item)}
            />
          ))}
        </div>
      ))}
      <div className="mt-2 grid gap-0.5 border-t border-line pt-2">
        <NavLink base={base} item={settingsItem} active={isActive(pathname, base, settingsItem)} />
      </div>
    </nav>
  );
}
