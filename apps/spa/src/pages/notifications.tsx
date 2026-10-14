import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Globe,
  Mail,
  Plug,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";

import { relativeTime, useNow } from "@/components/inbox/format";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { markAllNotificationsRead, markNotificationsRead } from "@/lib/actions";
import { listNotifications, type NotificationRow } from "@/lib/api";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread";

const WELL: Record<string, string> = {
  info: "bg-info-soft text-info-ink",
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
  neutral: "bg-canvas-sunken text-ink-muted",
};

function styleFor(type: string): { icon: typeof Bell; state: keyof typeof WELL } {
  if (type.startsWith("incident") || type.includes("bounce") || type.includes("complaint")) {
    return { icon: AlertTriangle, state: "danger" };
  }
  if (type.includes("domain")) return { icon: Globe, state: "warning" };
  if (type.includes("connection") || type.includes("webhook")) {
    return { icon: Plug, state: "warning" };
  }
  if (type.includes("mail") || type.includes("email") || type.includes("inbound")) {
    return { icon: Mail, state: "info" };
  }
  if (type.includes("security") || type.includes("member")) {
    return { icon: ShieldAlert, state: "neutral" };
  }
  return { icon: Bell, state: "info" };
}

function NotificationRowButton({
  n,
  now,
  onOpen,
}: {
  n: NotificationRow;
  now: number;
  onOpen: () => void;
}) {
  const style = styleFor(n.type);
  const Icon = style.icon;

  return (
    <li>
      <a
        href={n.link}
        onClick={onOpen}
        data-testid="notification-row"
        data-unread={n.readAt ? "false" : "true"}
        className="flex items-start gap-3 rounded-xl bg-surface p-3.5 shadow-md transition-colors duration-150 outline-none hover:bg-canvas-sunken focus-visible:ring-2 focus-visible:ring-accent min-[560px]:px-4"
      >
        <span
          aria-hidden
          className={cn("grid size-9 shrink-0 place-items-center rounded-full", WELL[style.state])}
        >
          <Icon className="size-[18px]" />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className={cn("truncate text-sm", n.readAt ? "font-medium" : "font-bold")}>
            {n.title}
          </span>
          {n.body ? (
            <span className="line-clamp-2 text-[0.8125rem] text-ink-muted">{n.body}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5 text-xs text-ink-muted">
          <time dateTime={n.createdAt}>{now ? relativeTime(n.createdAt, now) : ""}</time>
          {n.readAt ? null : (
            <span role="img" aria-label="Unread" className="size-2 rounded-full bg-accent" />
          )}
        </span>
      </a>
    </li>
  );
}

export function NotificationsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/notifications" });
  const queryClient = useQueryClient();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["notifications", orgSlug, "list", filter],
    queryFn: () => listNotifications(orgSlug, filter === "unread"),
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

  const page = list.data;
  const unreadCount = page?.unreadCount ?? 0;

  return (
    <ResourcePage
      title="Notifications"
      description="Mail, alerts and domain changes as they happen."
    >
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Filter" className="flex gap-1 rounded-full bg-canvas-sunken p-1">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-3.5 py-1 text-[0.8125rem] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent",
                filter === f ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink",
              )}
            >
              {f === "all" ? "All" : `Unread${unreadCount ? ` · ${unreadCount}` : ""}`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={markAll.isPending || unreadCount === 0}
            onClick={() => markAll.mutate()}
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line px-3 text-xs font-semibold hover:bg-canvas-sunken disabled:opacity-50"
          >
            <CheckCheck aria-hidden className="size-3.5" />
            Mark all read
          </button>
          <Link
            to="/$orgSlug/settings/notifications"
            params={{ orgSlug }}
            className="inline-flex h-8 items-center gap-1.5 rounded-control px-3 text-xs font-semibold text-ink-secondary hover:bg-canvas-sunken hover:text-ink"
          >
            <Settings aria-hidden className="size-3.5" />
            Settings
          </Link>
        </div>
      </div>

      {list.isPending ? (
        <ResourcePending />
      ) : list.isError ? (
        <ResourceError message="Could not load notifications." />
      ) : !page || page.items.length === 0 ? (
        <ResourceEmpty
          mood="sleep"
          title={filter === "unread" ? "You're all caught up" : "Nothing here yet"}
        >
          {filter === "unread"
            ? "No unread notifications. Wizi is taking a nap."
            : "New mail, alerts and domain changes will show up here as they happen."}
        </ResourceEmpty>
      ) : (
        <ul className="grid gap-2" aria-label="Notifications" data-testid="notification-list">
          {page.items.map((n) => (
            <NotificationRowButton
              key={n.id}
              n={n}
              now={now}
              onOpen={() => {
                if (!n.readAt) markOne.mutate(n.id);
              }}
            />
          ))}
        </ul>
      )}
    </ResourcePage>
  );
}
