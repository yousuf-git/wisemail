import { navGroups, settingsItem } from "@/lib/nav";
import { SETTINGS_SECTIONS } from "@/components/shell/settings-nav";

export type CommandHit = {
  id: string;
  label: string;
  group: string;
  path: string;
  keywords: string;
};

/** Workspace jump targets for ⌘K (nav + settings + common actions). */
export function buildCommandIndex(orgSlug: string): CommandHit[] {
  const hits: CommandHit[] = [
    {
      id: "overview",
      label: "Overview",
      group: "Workspace",
      path: `/${orgSlug}`,
      keywords: "home dashboard",
    },
    {
      id: "compose",
      label: "Compose",
      group: "Mail",
      path: `/${orgSlug}/compose`,
      keywords: "write new email send",
    },
    {
      id: "notifications",
      label: "Notifications",
      group: "Workspace",
      path: `/${orgSlug}/notifications`,
      keywords: "bell alerts feed",
    },
  ];

  for (const group of navGroups) {
    for (const item of group.items) {
      hits.push({
        id: item.path,
        label: item.label,
        group: group.label,
        path: `/${orgSlug}/${item.path}`,
        keywords: `${item.label} ${item.path}`.toLowerCase(),
      });
    }
  }

  hits.push({
    id: settingsItem.path,
    label: settingsItem.label,
    group: "Settings",
    path: `/${orgSlug}/${settingsItem.path}`,
    keywords: "settings preferences",
  });

  for (const section of SETTINGS_SECTIONS) {
    hits.push({
      id: `settings/${section.slug}`,
      label: section.label,
      group: "Settings",
      path: `/${orgSlug}/settings/${section.slug}`,
      keywords: `${section.label} settings ${section.slug}`.toLowerCase(),
    });
  }

  return hits;
}

export function filterCommands(hits: CommandHit[], query: string): CommandHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return hits;
  return hits.filter((h) => {
    const hay = `${h.label} ${h.group} ${h.keywords} ${h.path}`.toLowerCase();
    return q.split(/\s+/).every((part) => hay.includes(part));
  });
}
