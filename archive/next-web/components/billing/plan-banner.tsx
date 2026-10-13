"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

export type PlanBannerData = {
  kind: "over_allowance" | "trial" | "payment";
  message: string;
  action: { label: string; href: string };
};

const HOURS_24 = 24 * 60 * 60 * 1000;
const EVENT = "wisemail:banner-dismissed";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** Time until which the banner stays dismissed (0 = never; storage may be unavailable). */
function readDismissedUntil(key: string): number {
  try {
    return Number(window.localStorage.getItem(key) ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Plan banner below the top bar (FED §8): one at a time, one action, dismissible for 24 hours.
 * Over-allowance uses `warning`, trial uses `accent`.
 */
export function PlanBanner({ banner }: { banner: PlanBannerData | null }) {
  const storageKey = banner ? `wisemail:banner:${banner.kind}` : null;
  // The server snapshot hides the banner so hydration matches; the client then reads storage.
  const hidden = useSyncExternalStore(
    subscribe,
    () => (storageKey ? readDismissedUntil(storageKey) > Date.now() : false),
    () => true,
  );

  if (!banner || hidden) return null;
  const warning = banner.kind === "over_allowance";
  const danger = banner.kind === "payment";
  return (
    <div
      role="status"
      data-testid="plan-banner"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-2.5 text-sm",
        danger
          ? "bg-danger-soft text-danger-ink"
          : warning
            ? "bg-warning-soft text-warning-ink"
            : "bg-accent-soft text-info-ink",
      )}
    >
      <span className="min-w-0 flex-1 font-medium">{banner.message}</span>
      <Link href={banner.action.href} className="font-bold underline underline-offset-4">
        {banner.action.label}
      </Link>
      <button
        type="button"
        aria-label="Dismiss for 24 hours"
        onClick={() => {
          try {
            if (storageKey) window.localStorage.setItem(storageKey, String(Date.now() + HOURS_24));
          } catch {
            /* dismissal just isn't remembered */
          }
          window.dispatchEvent(new Event(EVENT));
        }}
        className="rounded-md p-1 outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
