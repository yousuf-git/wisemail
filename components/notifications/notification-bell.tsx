"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { BellIcon, type AnimatedIconHandle } from "@/components/icons/animated";
import { useLiveQuery } from "@/lib/realtime/use-live-query";
import { topics } from "@/lib/realtime/topics";
import { cn } from "@/lib/utils";

const iconButton =
  "grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink-secondary shadow-sm ring-1 ring-line outline-none transition-[transform,background-color] duration-150 ease-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.97]";

/**
 * Top-bar bell (UC-19). The count comes from the server for the first paint, then stays live:
 * a `notifications:<user>` event refetches it, and the bell rings when it goes up.
 */
export function NotificationBell({
  orgSlug,
  orgId,
  userId,
  initialCount = 0,
}: {
  orgSlug: string;
  orgId: string;
  userId: string;
  initialCount?: number;
}) {
  const bell = useRef<AnimatedIconHandle>(null);
  const previous = useRef(initialCount);
  const { data } = useLiveQuery({
    queryKey: ["notifications", orgSlug, "unread"],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/v1/notifications/unread?orgSlug=${encodeURIComponent(orgSlug)}`,
        {
          signal,
        },
      );
      if (!res.ok) throw new Error("Couldn't load notifications");
      return (await res.json()) as { unreadCount: number };
    },
    topics: [topics.notifications(orgId, userId)],
    initialData: { unreadCount: initialCount },
    staleTime: 5_000,
  });
  const count = data?.unreadCount ?? 0;

  useEffect(() => {
    if (count > previous.current) bell.current?.startAnimation();
    previous.current = count;
  }, [count]);

  return (
    <Link
      href={`/${orgSlug}/notifications`}
      aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
      data-testid="notification-bell"
      className={cn(iconButton, "relative")}
    >
      <BellIcon ref={bell} size={18} />
      {count > 0 ? (
        <span
          data-testid="notification-count"
          className="absolute -top-1 -right-1 grid min-w-[1.125rem] place-items-center rounded-full bg-coral px-1 text-[0.6875rem] leading-[1.125rem] font-bold text-white ring-2 ring-surface"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
