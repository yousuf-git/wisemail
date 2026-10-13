import { Link, useRouterState } from "@tanstack/react-router";

import { isNavActive, navGroups, settingsItem, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

const SETTINGS_EXTRA: NavItem[] = [
  { label: "Connections", path: "settings/connections", alsoActiveFor: ["settings/connections"] },
  { label: "Senders", path: "settings/senders", alsoActiveFor: ["settings/senders"] },
  { label: "Members", path: "settings/members", alsoActiveFor: ["settings/members"] },
];

type LinkTarget =
  | { to: "/$orgSlug/inbox"; params: { orgSlug: string } }
  | { to: "/$orgSlug/scheduled"; params: { orgSlug: string } }
  | { to: "/$orgSlug/activity"; params: { orgSlug: string } }
  | { to: "/$orgSlug/audience/contacts"; params: { orgSlug: string } }
  | { to: "/$orgSlug/broadcasts"; params: { orgSlug: string } }
  | { to: "/$orgSlug/templates"; params: { orgSlug: string } }
  | { to: "/$orgSlug/insights"; params: { orgSlug: string } }
  | { to: "/$orgSlug/alerts"; params: { orgSlug: string } }
  | { to: "/$orgSlug/domains"; params: { orgSlug: string } }
  | { to: "/$orgSlug/api-keys"; params: { orgSlug: string } }
  | { to: "/$orgSlug/settings/general"; params: { orgSlug: string } }
  | { to: "/$orgSlug/settings/connections"; params: { orgSlug: string } }
  | { to: "/$orgSlug/settings/senders"; params: { orgSlug: string } }
  | { to: "/$orgSlug/settings/members"; params: { orgSlug: string } }
  | { to: "/$orgSlug/$"; params: { orgSlug: string; _splat: string } };

function itemTo(orgSlug: string, item: NavItem): LinkTarget {
  const map: Record<string, LinkTarget["to"]> = {
    inbox: "/$orgSlug/inbox",
    scheduled: "/$orgSlug/scheduled",
    activity: "/$orgSlug/activity",
    "audience/contacts": "/$orgSlug/audience/contacts",
    broadcasts: "/$orgSlug/broadcasts",
    templates: "/$orgSlug/templates",
    insights: "/$orgSlug/insights",
    alerts: "/$orgSlug/alerts",
    domains: "/$orgSlug/domains",
    "api-keys": "/$orgSlug/api-keys",
    "settings/general": "/$orgSlug/settings/general",
    "settings/connections": "/$orgSlug/settings/connections",
    "settings/senders": "/$orgSlug/settings/senders",
    "settings/members": "/$orgSlug/settings/members",
  };
  const to = map[item.path];
  if (to && to !== "/$orgSlug/$") {
    return { to, params: { orgSlug } } as LinkTarget;
  }
  return { to: "/$orgSlug/$", params: { orgSlug, _splat: item.path } };
}

function NavItemLink({ orgSlug, item, pathname }: { orgSlug: string; item: NavItem; pathname: string }) {
  const active = isNavActive(pathname, orgSlug, item);
  const target = itemTo(orgSlug, item);
  return (
    <Link
      {...target}
      className={cn(
        "rounded-control px-2.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-accent-soft text-accent-fill"
          : "text-ink-secondary hover:bg-canvas-sunken hover:text-ink",
      )}
    >
      {item.label}
    </Link>
  );
}

export function NavLinks({ orgSlug }: { orgSlug: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="grid gap-4" aria-label="Workspace">
      {navGroups.map((group) => (
        <div key={group.label} className="grid gap-0.5">
          <p className="px-2.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
            {group.label}
          </p>
          {group.items.map((item) => (
            <NavItemLink key={item.path} orgSlug={orgSlug} item={item} pathname={pathname} />
          ))}
        </div>
      ))}
      <div className="grid gap-0.5 border-t border-line pt-3">
        <p className="px-2.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
          Settings
        </p>
        <NavItemLink orgSlug={orgSlug} item={settingsItem} pathname={pathname} />
        {SETTINGS_EXTRA.map((item) => (
          <NavItemLink key={item.path} orgSlug={orgSlug} item={item} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}
