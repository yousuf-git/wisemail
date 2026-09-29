"use client";

import { Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BellIcon } from "@/components/icons/animated";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const labels: Record<string, string> = {
  "api-keys": "API keys",
  ai: "AI",
};

function label(segment: string) {
  if (labels[segment]) return labels[segment];
  const words = decodeURIComponent(segment).replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const iconButton =
  "grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink-secondary shadow-sm ring-1 ring-line outline-none transition-[transform,background-color] duration-150 ease-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.97]";

/**
 * Top bar: mobile menu, breadcrumb, search pill, notifications and theme.
 * `dock` is the server-rendered dock; below 1000px it opens in a sheet.
 */
export function Topbar({
  orgName,
  orgSlug,
  dock,
  orgId,
  userId,
  unreadNotifications = 0,
}: {
  orgName: string;
  orgSlug: string;
  dock: React.ReactNode;
  /** With `userId`, turns on the live notification bell. */
  orgId?: string;
  userId?: string;
  unreadNotifications?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    // close the sheet after navigating
    setLastPath(pathname);
    setOpen(false);
  }

  const base = `/${orgSlug}`;
  const rest = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1).split("/") : [];
  const crumbs = rest.length ? rest : ["overview"];

  return (
    <div className="flex items-center gap-2.5">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Open menu"
            className={cn(iconButton, "min-[1000px]:hidden")}
          >
            <Menu aria-hidden className="size-[18px]" />
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[min(85vw,300px)] gap-0 border-0 bg-surface p-3 sm:max-w-none"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Move between sections of {orgName}.
          </SheetDescription>
          {dock}
        </SheetContent>
      </Sheet>

      <nav aria-label="Breadcrumb" className="min-w-0 text-[0.8125rem] text-ink-muted">
        <ol className="flex min-w-0 items-center gap-1.5">
          <li className="hidden min-w-0 items-center gap-1.5 min-[420px]:flex">
            <Link href={base} className="truncate rounded-sm hover:text-ink">
              {orgName}
            </Link>
            <span aria-hidden>/</span>
          </li>
          {crumbs.map((segment, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li
                key={`${segment}-${i}`}
                className={cn("flex min-w-0 items-center gap-1.5", !last && "hidden sm:flex")}
              >
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn("truncate", last && "font-semibold text-ink")}
                >
                  {label(segment)}
                </span>
                {!last ? <span aria-hidden>/</span> : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="ml-auto flex items-center gap-2.5">
        <button
          type="button"
          aria-label="Search (Command K)"
          className="flex items-center gap-2 rounded-full bg-surface px-3 py-[7px] text-[0.8125rem] text-ink-muted shadow-sm ring-1 ring-line transition-colors duration-150 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Search aria-hidden className="size-[18px]" />
          <span className="hidden sm:inline">Search emails, contacts…</span>
          <kbd className="hidden rounded-[5px] bg-canvas-sunken px-1.5 py-px font-mono text-[0.6875rem] text-ink-muted sm:inline">
            ⌘K
          </kbd>
        </button>
        {orgId && userId ? (
          <NotificationBell
            orgSlug={orgSlug}
            orgId={orgId}
            userId={userId}
            initialCount={unreadNotifications}
          />
        ) : (
          <Link
            href={`${base}/notifications`}
            aria-label="Notifications"
            className={cn(iconButton, "relative")}
          >
            <BellIcon size={18} />
          </Link>
        )}
        <ThemeToggle className="hidden md:inline-flex" />
      </div>
    </div>
  );
}
