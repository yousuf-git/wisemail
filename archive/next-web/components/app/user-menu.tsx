"use client";

import { LogOut, Settings2, Sparkles } from "lucide-react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTours } from "@/components/tour/tour-context";

type User = { name: string; email: string; image?: string | null };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() ||
    "?"
  );
}

/** Avatar row at the bottom of the dock with account links and sign out. */
export function UserMenu({
  user,
  orgSlug,
  badge,
}: {
  user: User;
  orgSlug: string;
  badge?: React.ReactNode;
}) {
  const tours = useTours();
  const welcome = tours?.tours.find((t) => t.id === "welcome");
  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Account menu for ${user.name}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full py-0.5 pr-2 text-left outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Avatar className="size-[26px]">
            {user.image ? <AvatarImage src={user.image} alt="" /> : null}
            <AvatarFallback className="bg-coral text-[0.6875rem] font-bold text-ink">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-[0.8125rem] font-medium">{user.name}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-60 rounded-lg shadow-lg">
          <DropdownMenuLabel className="grid gap-0.5 font-normal">
            <span className="truncate font-semibold text-ink">{user.name}</span>
            <span className="truncate text-xs text-ink-muted">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={`/${orgSlug}/settings/general`}>
              <Settings2 aria-hidden />
              Settings
            </Link>
          </DropdownMenuItem>
          {welcome ? (
            <DropdownMenuItem onSelect={() => tours?.start("welcome")}>
              <Sparkles aria-hidden />
              Restart product tour
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link href="/sign-out" prefetch={false}>
              <LogOut aria-hidden />
              Sign out
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {badge}
    </div>
  );
}
