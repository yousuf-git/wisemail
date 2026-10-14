import { Link } from "@tanstack/react-router";
import { LogOut, Settings2, Sparkles } from "lucide-react";

import { useTours } from "@/components/tour/tour-context";
import { authClient } from "@/lib/auth/client";

type User = { name: string; email: string; image?: string | null };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() ||
    "?"
  );
}

/** Avatar + account menu at the bottom of the dock. */
export function UserMenu({ user, orgSlug }: { user: User; orgSlug: string }) {
  const tours = useTours();
  const welcome = tours?.tours.find((t) => t.id === "welcome");

  return (
    <details className="group relative">
      <summary
        aria-label={`Account menu for ${user.name}`}
        className="flex cursor-pointer list-none items-center gap-2 rounded-full py-0.5 pr-2 text-left outline-none hover:bg-canvas-sunken focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
      >
        {user.image ? (
          <img
            src={user.image}
            alt=""
            className="size-[26px] rounded-full object-cover"
          />
        ) : (
          <span className="grid size-[26px] place-items-center rounded-full bg-coral text-[0.6875rem] font-bold text-ink">
            {initials(user.name)}
          </span>
        )}
        <span className="min-w-0 truncate text-[0.8125rem] font-medium">{user.name}</span>
      </summary>
      <div className="absolute bottom-full left-0 z-30 mb-2 w-60 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
        <div className="grid gap-0.5 border-b border-line px-3 py-2.5">
          <span className="truncate text-sm font-semibold">{user.name}</span>
          <span className="truncate text-xs text-ink-muted">{user.email}</span>
        </div>
        <ul className="grid py-1 text-sm">
          <li>
            <Link
              to="/$orgSlug/settings/general"
              params={{ orgSlug }}
              className="flex items-center gap-2 px-3 py-2 hover:bg-canvas-sunken"
            >
              <Settings2 aria-hidden className="size-4" />
              Settings
            </Link>
          </li>
          {welcome ? (
            <li>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-canvas-sunken"
                onClick={() => tours?.start("welcome")}
              >
                <Sparkles aria-hidden className="size-4" />
                Restart product tour
              </button>
            </li>
          ) : null}
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-canvas-sunken"
              onClick={async () => {
                await authClient.signOut();
                window.location.assign("/sign-in");
              }}
            >
              <LogOut aria-hidden className="size-4" />
              Sign out
            </button>
          </li>
        </ul>
      </div>
    </details>
  );
}
