import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { setDefaultSender } from "@/lib/actions";
import { listSenders } from "@/lib/api";

export function SettingsSendersPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/senders" });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const senders = useQuery({
    queryKey: ["senders", orgSlug],
    queryFn: () => listSenders(orgSlug),
  });

  const makeDefault = useMutation({
    mutationFn: (row: { id: string; version: number }) =>
      setDefaultSender(orgSlug, row.id, row.version),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["senders", orgSlug] });
    },
    onError: () => setError("Could not update the default sender."),
  });

  return (
    <ResourcePage title="Senders" description="`GET /api/v1/senders` · set default via action">
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      {senders.isPending ? (
        <ResourcePending />
      ) : senders.isError ? (
        <ResourceError message="Could not load senders." />
      ) : senders.data.length === 0 ? (
        <ResourceEmpty>No senders configured.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {senders.data.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {row.displayName ? `${row.displayName} <${row.address}>` : row.address}
                </p>
                <p className="text-xs text-ink-muted">
                  {row.isDefault ? "Default sender" : "Sender"} · {row.status}
                </p>
              </div>
              {row.isDefault ? (
                <span className="shrink-0 text-xs font-medium text-accent-fill">Default</span>
              ) : (
                <button
                  type="button"
                  disabled={makeDefault.isPending}
                  onClick={() => makeDefault.mutate({ id: row.id, version: row.version })}
                  className="shrink-0 rounded-control border border-line px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-canvas-sunken disabled:opacity-50"
                >
                  Make default
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </ResourcePage>
  );
}
