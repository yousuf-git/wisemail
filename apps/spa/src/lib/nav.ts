/** Org-relative nav (SPA). Icons stay out of this module to keep the data tree-shakeable. */
export type NavItem = {
  label: string;
  path: string;
  alsoActiveFor?: string[];
};

export const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Mail",
    items: [
      { label: "Inbox", path: "inbox" },
      { label: "Sent", path: "sent" },
      { label: "Scheduled", path: "scheduled" },
      { label: "Trash", path: "trash" },
      { label: "Activity", path: "activity" },
    ],
  },
  {
    label: "Audience",
    items: [
      { label: "Contacts", path: "audience/contacts", alsoActiveFor: ["audience"] },
      { label: "Segments", path: "audience/segments" },
      { label: "Topics", path: "audience/topics" },
      { label: "Properties", path: "audience/properties" },
      { label: "Broadcasts", path: "broadcasts" },
      { label: "Templates", path: "templates" },
    ],
  },
  {
    label: "Health",
    items: [
      { label: "Insights", path: "insights" },
      { label: "Alerts", path: "alerts" },
      { label: "Domains", path: "domains" },
      { label: "API keys", path: "api-keys" },
    ],
  },
];

export const settingsItem: NavItem = {
  label: "Settings",
  path: "settings/general",
  alsoActiveFor: ["settings"],
};

export function isNavActive(pathname: string, orgSlug: string, item: NavItem) {
  const base = `/${orgSlug}`;
  const prefixes = [item.path, ...(item.alsoActiveFor ?? [])];
  return prefixes.some((p) => {
    const href = `${base}/${p}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  });
}
