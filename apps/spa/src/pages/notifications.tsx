import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";

import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { markAllNotificationsRead, markNotificationsRead } from "@/lib/actions";
import { listNotifications } from "@/lib/api";
import { cn } from "@/lib/utils";

export function NotificationsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/notifications" });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["notifications", orgSlug, "list"],
    queryFn: () => listNotifications(orgSlug),
  });

  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(orgSlug),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["notifications", orgSlug] });
    },
  });

  const markOne = useMutation({
    mutationFn: (id: string) => markNotificationsRead(orgSlug, [id]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications", orgSlug] });
    },
  });

  return (
    <ResourcePage title="Notifications" description="In-app feed · live via `/api/stream`">
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={markAll.isPending || (list.data?.unreadCount ?? 0) === 0}
          onClick={() => markAll.mutate()}
          className="h-8 rounded-control border border-line px-3 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
        >
          Mark all read
        </button>
      </div>
      {list.isPending ? (
        <ResourcePending />
      ) : list.isError ? (
        <ResourceError message="Could not load notifications." />
      ) : list.data.items.length === 0 ? (
        <ResourceEmpty>No notifications yet.</ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {list.data.items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={cn(
                  "grid w-full gap-1 px-4 py-3 text-left hover:bg-canvas-sunken",
                  !n.readAt && "bg-accent-soft/30",
                )}
                onClick={() => {
                  if (!n.readAt) markOne.mutate(n.id);
                  if (n.link.startsWith("/")) window.location.assign(n.link);
                }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-semibold">{n.title}</p>
                  <time className="shrink-0 text-xs text-ink-faint">
                    {new Date(n.createdAt).toLocaleString()}
                  </time>
                </div>
                {n.body ? <p className="text-sm text-ink-secondary">{n.body}</p> : null}
                <p className="text-xs text-ink-muted">{n.type}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ResourcePage>
  );
}
