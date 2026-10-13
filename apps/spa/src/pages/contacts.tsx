import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { listContacts } from "@/lib/api";

export function ContactsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/audience/contacts" });
  const contacts = useQuery({
    queryKey: ["contacts", orgSlug],
    queryFn: () => listContacts(orgSlug),
  });

  return (
    <ResourcePage title="Contacts" description="`GET /api/v1/contacts`">
      {contacts.isPending ? (
        <ResourcePending />
      ) : contacts.isError ? (
        <ResourceError message="Could not load contacts." />
      ) : contacts.data.items.length === 0 ? (
        <ResourceEmpty>No contacts synced yet.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {contacts.data.items.map((row) => {
            const name = [row.firstName, row.lastName].filter(Boolean).join(" ");
            return (
              <li key={row.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{name || row.email}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {row.email}
                    {name ? ` · ${row.connectionName}` : null}
                    {row.unsubscribed ? " · unsubscribed" : null}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-ink-faint">
                  {new Date(row.createdAt).toLocaleDateString()}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </ResourcePage>
  );
}
