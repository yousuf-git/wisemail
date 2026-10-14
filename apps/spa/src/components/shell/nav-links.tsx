import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  ChartLine,
  Clock,
  Globe,
  Inbox,
  Key,
  Megaphone,
  Send,
  Settings,
  Trash2,
  Users,
  FileText,
  Tags,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";

import { isNavActive, navGroups, settingsItem, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

type LinkTarget =
  | { to: "/$orgSlug/inbox"; params: { orgSlug: string } }
  | { to: "/$orgSlug/sent"; params: { orgSlug: string } }
  | { to: "/$orgSlug/scheduled"; params: { orgSlug: string } }
  | { to: "/$orgSlug/trash"; params: { orgSlug: string } }
  | { to: "/$orgSlug/activity"; params: { orgSlug: string } }
  | { to: "/$orgSlug/audience/contacts"; params: { orgSlug: string } }
  | { to: "/$orgSlug/audience/segments"; params: { orgSlug: string } }
  | { to: "/$orgSlug/audience/topics"; params: { orgSlug: string } }
  | { to: "/$orgSlug/audience/properties"; params: { orgSlug: string } }
  | { to: "/$orgSlug/broadcasts"; params: { orgSlug: string } }
  | { to: "/$orgSlug/templates"; params: { orgSlug: string } }
  | { to: "/$orgSlug/insights"; params: { orgSlug: string } }
  | { to: "/$orgSlug/alerts"; params: { orgSlug: string } }
  | { to: "/$orgSlug/domains"; params: { orgSlug: string } }
  | { to: "/$orgSlug/api-keys"; params: { orgSlug: string } }
  | { to: "/$orgSlug/settings/general"; params: { orgSlug: string } }
  | { to: "/$orgSlug/$"; params: { orgSlug: string; _splat: string } };

const ICONS: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  inbox: Inbox,
  sent: Send,
  scheduled: Clock,
  trash: Trash2,
  activity: Activity,
  "audience/contacts": Users,
  "audience/segments": Tags,
  "audience/topics": Megaphone,
  "audience/properties": SlidersHorizontal,
  broadcasts: Megaphone,
  templates: FileText,
  insights: ChartLine,
  alerts: TriangleAlert,
  domains: Globe,
  "api-keys": Key,
  "settings/general": Settings,
};

function itemTo(orgSlug: string, item: NavItem): LinkTarget {
  const map: Record<string, LinkTarget["to"]> = {
    inbox: "/$orgSlug/inbox",
    sent: "/$orgSlug/sent",
    scheduled: "/$orgSlug/scheduled",
    trash: "/$orgSlug/trash",
    activity: "/$orgSlug/activity",
    "audience/contacts": "/$orgSlug/audience/contacts",
    "audience/segments": "/$orgSlug/audience/segments",
    "audience/topics": "/$orgSlug/audience/topics",
    "audience/properties": "/$orgSlug/audience/properties",
    broadcasts: "/$orgSlug/broadcasts",
    templates: "/$orgSlug/templates",
    insights: "/$orgSlug/insights",
    alerts: "/$orgSlug/alerts",
    domains: "/$orgSlug/domains",
    "api-keys": "/$orgSlug/api-keys",
    "settings/general": "/$orgSlug/settings/general",
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
  const Icon = ICONS[item.path];
  return (
    <Link
      {...target}
      className={cn(
        "group flex items-center gap-2 rounded-control px-2.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-accent-soft text-accent-fill"
          : "text-ink-secondary hover:bg-canvas-sunken hover:text-ink",
      )}
    >
      {Icon ? (
        <Icon
          size={16}
          aria-hidden
          className="shrink-0 transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-rotate-6 group-focus-visible:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-hover:rotate-0"
        />
      ) : null}
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
        <NavItemLink orgSlug={orgSlug} item={settingsItem} pathname={pathname} />
      </div>
    </nav>
  );
}
