"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  markAllNotificationsReadAction,
  markNotificationsReadAction,
} from "@/app/(app)/[orgSlug]/notifications/actions";
import { EmptyState } from "@/components/app/empty-state";
import { relativeTime, useNow } from "@/components/inbox/format";
import { Button } from "@/components/ui/button";
import type { NotificationDTO, NotificationsPage } from "@/lib/dto/notification";
import { topics } from "@/lib/realtime/topics";
import { useLiveQuery } from "@/lib/realtime/use-live-query";
import { cn } from "@/lib/utils";
import { WELL_CLASS, styleFor } from "./notification-style";

type Filter = "all" | "unread";

async function fetchPage(
  orgSlug: string,
  filter: Filter,
  limit: number,
  signal?: AbortSignal,
): Promise<NotificationsPage> {
  const params = new URLSearchParams({ orgSlug, limit: String(limit) });
  if (filter === "unread") params.set("unread", "1");
  const res = await fetch(`/api/v1/notifications?${params}`, { signal });
  if (!res.ok) throw new Error("Couldn't load notifications");
  return (await res.json()) as NotificationsPage;
}

const PAGE = 30;

/** UC-19: the member's notification history, live, with mark read and all read. */
export function NotificationsView({
  orgSlug,
  orgId,
  userId,
  initial,
}: {
  orgSlug: string;
  orgId: string;
  userId: string;
  initial: NotificationsPage;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const [pending, startTransition] = useTransition();

  const { data } = useLiveQuery({
    queryKey: ["notifications", orgSlug, "feed", filter, limit],
    queryFn: ({ signal }) => fetchPage(orgSlug, filter, limit, signal),
    topics: [topics.notifications(orgId, userId)],
    initialData: filter === "all" && limit === PAGE ? initial : undefined,
    placeholderData: (previous) => previous,
    staleTime: 5_000,
  });
  const page = data ?? initial;

  function refreshCounts() {
    void queryClient.invalidateQueries({ queryKey: ["notifications", orgSlug] });
  }

  function markRead(n: NotificationDTO) {
    if (n.readAt) return;
    void markNotificationsReadAction(orgSlug, [n.id]).then(refreshCounts);
  }

  function markAll() {
    startTransition(async () => {
      const result = await markAllNotificationsReadAction(orgSlug);
      if (!result.ok) toast.error(result.error.message);
      else toast.success(result.data.updated ? "All caught up" : "Nothing new to mark");
      refreshCounts();
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Filter"
          className="flex gap-1 rounded-full bg-canvas-sunken p-1"
        >
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => {
                setFilter(f);
                setLimit(PAGE);
              }}
              className={cn(
                "rounded-full px-3.5 py-1 text-[0.8125rem] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent",
                filter === f ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
              )}
            >
              {f === "all" ? "All" : `Unread${page.unreadCount ? ` · ${page.unreadCount}` : ""}`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={markAll}
            disabled={pending || page.unreadCount === 0}
          >
            <CheckCheck aria-hidden /> Mark all read
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/${orgSlug}/settings/notifications`}>
              <Settings aria-hidden /> Settings
            </Link>
          </Button>
        </div>
      </div>

      {page.items.length === 0 ? (
        <EmptyState
          title={filter === "unread" ? "You're all caught up" : "Nothing here yet"}
          mood="sleep"
        >
          {filter === "unread"
            ? "No unread notifications. Wizi is taking a nap."
            : "New mail, alerts and domain changes will show up here as they happen."}
        </EmptyState>
      ) : (
        <ul className="grid gap-2" aria-label="Notifications" data-testid="notification-list">
          {page.items.map((n) => {
            const style = styleFor(n.type);
            const Icon = style.icon;
            return (
              <li key={n.id}>
                <Link
                  href={n.link}
                  onClick={() => markRead(n)}
                  data-testid="notification-row"
                  data-unread={n.readAt ? "false" : "true"}
                  className={cn(
                    "flex items-start gap-3 rounded-xl bg-surface p-3.5 shadow-md transition-colors duration-150 outline-none hover:bg-canvas-sunken focus-visible:ring-2 focus-visible:ring-accent min-[560px]:px-4",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-full",
                      WELL_CLASS[style.state],
                    )}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span
                      className={cn("truncate text-sm", n.readAt ? "font-medium" : "font-bold")}
                    >
                      {n.title}
                    </span>
                    {n.body ? (
                      <span className="line-clamp-2 text-[0.8125rem] text-ink-muted">{n.body}</span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5 text-xs text-ink-muted">
                    <time dateTime={n.createdAt} suppressHydrationWarning>
                      {now ? relativeTime(n.createdAt, now) : ""}
                    </time>
                    {n.readAt ? null : (
                      <span
                        role="img"
                        aria-label="Unread"
                        className="size-2 rounded-full bg-accent"
                      />
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {page.nextCursor ? (
        <Button
          variant="outline"
          className="justify-self-center"
          onClick={() => setLimit((l) => l + PAGE)}
        >
          Show older
        </Button>
      ) : null}
    </div>
  );
}
