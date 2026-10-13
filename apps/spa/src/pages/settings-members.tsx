import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { listMembersBundle } from "@/lib/api";

export function SettingsMembersPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/members" });
  const bundle = useQuery({
    queryKey: ["members", orgSlug],
    queryFn: () => listMembersBundle(orgSlug),
  });

  return (
    <ResourcePage title="Members" description="`GET /api/v1/members` (Owners/Admins)">
      {bundle.isPending ? (
        <ResourcePending />
      ) : bundle.isError ? (
        <ResourceError message="Could not load members (permission or API)." />
      ) : (
        <div className="grid gap-6">
          <div className="grid gap-2">
            <h2 className="text-sm font-semibold">People</h2>
            {bundle.data.members.length === 0 ? (
              <ResourceEmpty>No members.</ResourceEmpty>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {bundle.data.members.map((row) => (
                  <li key={row.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.name}
                        {row.isYou ? " (you)" : ""}
                      </p>
                      <p className="truncate text-xs text-ink-muted">{row.email}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-ink-secondary">{row.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-2">
            <h2 className="text-sm font-semibold">Pending invitations</h2>
            {bundle.data.invitations.length === 0 ? (
              <p className="text-sm text-ink-muted">None pending.</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {bundle.data.invitations.map((row) => (
                  <li key={row.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                    <p className="truncate text-sm font-medium">{row.email}</p>
                    <span className="shrink-0 text-xs text-ink-secondary">{row.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </ResourcePage>
  );
}