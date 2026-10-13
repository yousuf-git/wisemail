import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { markAllNotificationsRead, markNotificationsRead } from "@/lib/actions";
import { getUnreadNotificationCount, listNotifications } from "@/lib/api";
import { cn } from "@/lib/utils";

export function NotificationBell({ orgSlug }: { orgSlug: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const unread = useQuery({
    queryKey: ["notifications", orgSlug, "unread"],
    queryFn: () => getUnreadNotificationCount(orgSlug),
    refetchInterval: open ? false : 60_000,
  });

  const list = useQuery({
    queryKey: ["notifications", orgSlug, "list"],
    queryFn: () => listNotifications(orgSlug),
    enabled: open,
  });

  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(orgSlug),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications", orgSlug] });
    },
  });

  const markOne = useMutation({
    mutationFn: (id: string) => markNotificationsRead(orgSlug, [id]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications", orgSlug] });
    },
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const count = unread.data?.unreadCount ?? 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative grid size-9 place-items-center rounded-control border border-line bg-surface text-ink-secondary",
          "hover:bg-canvas-sunken hover:text-ink",
        )}
      >
        <Bell size={18} aria-hidden />
        {count > 0 ? (
          <span className="absolute -top-1 -right-1 grid min-w-[1.125rem] place-items-center rounded-full bg-accent-fill px-1 text-[0.6875rem] leading-[1.125rem] font-bold text-accent-ink">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute top-full right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            <div className="flex items-center gap-2">
              {count > 0 ? (
                <button
                  type="button"
                  disabled={markAll.isPending}
                  onClick={() => markAll.mutate()}
                  className="text-xs font-medium text-accent-fill hover:underline disabled:opacity-50"
                >
                  Mark all read
                </button>
              ) : null}
              <Link
                to="/$orgSlug/notifications"
                params={{ orgSlug }}
                className="text-xs font-medium text-ink-secondary hover:underline"
                onClick={() => setOpen(false)}
              >
                View all
              </Link>
            </div>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {list.isPending ? (
              <li className="px-3 py-4 text-sm text-ink-muted">Loading…</li>
            ) : list.isError ? (
              <li className="px-3 py-4 text-sm text-danger-ink">Could not load.</li>
            ) : (list.data?.items.length ?? 0) === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-ink-muted">You're caught up.</li>
            ) : (
              list.data!.items.slice(0, 8).map((n) => (
                <li key={n.id} className="border-b border-line last:border-0">
                  <button
                    type="button"
                    className={cn(
                      "grid w-full gap-0.5 px-3 py-2.5 text-left hover:bg-canvas-sunken",
                      !n.readAt && "bg-accent-soft/40",
                    )}
                    onClick={() => {
                      if (!n.readAt) markOne.mutate(n.id);
                      if (n.link.startsWith("/")) {
                        window.location.assign(n.link);
                      }
                      setOpen(false);
                    }}
                  >
                    <p className="truncate text-sm font-medium">{n.title}</p>
                    {n.body ? (
                      <p className="line-clamp-2 text-xs text-ink-muted">{n.body}</p>
                    ) : null}
                    <time className="text-[11px] text-ink-faint">
                      {new Date(n.createdAt).toLocaleString()}
                    </time>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
