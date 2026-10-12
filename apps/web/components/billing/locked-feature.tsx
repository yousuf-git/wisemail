"use client";

import { Lock } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Locked-feature pattern (FED §8 "Locked feature", PRD §5.12): a gated control stays visible at
 * normal size with a small lock and a faint label; hover or click opens a popover naming the plan
 * that includes it, with "See plans" for Owners or "Ask your Owner" for everyone else. Never hide
 * a gated feature. `children` is the control's visible face (icon and label): keep it
 * non-interactive, it sits inside the trigger button.
 */
export function LockedFeature({
  name,
  planLabel,
  orgSlug,
  isOwner,
  description,
  variant = "button",
  className,
  children,
}: {
  /** What is locked, e.g. "Assignment". */
  name: string;
  /** Cheapest plan that includes it, e.g. "Pro". */
  planLabel: string;
  orgSlug: string;
  isOwner: boolean;
  /** Optional extra line under the headline. */
  description?: string;
  /** `button` looks like an outlined control, `inline` like plain text with a lock. */
  variant?: "button" | "inline";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="locked-feature"
          aria-label={`${name} is on ${planLabel} and above`}
          className={cn(
            "inline-flex items-center gap-1.5 text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-accent",
            variant === "button"
              ? "h-8 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-canvas-sunken"
              : "rounded-sm text-[inherit] underline decoration-dotted underline-offset-4 hover:text-ink-muted",
            className,
          )}
        >
          {children}
          <Lock aria-hidden className="size-3.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <p className="text-sm font-semibold">
          {name} is on {planLabel} and above
        </p>
        {description ? <p className="mt-1 text-[0.8125rem] text-ink-muted">{description}</p> : null}
        <div className="mt-3">
          {isOwner ? (
            <Button asChild size="sm" className="font-bold">
              <Link href={`/${orgSlug}/settings/billing`}>See plans</Link>
            </Button>
          ) : (
            <p className="text-[0.8125rem] text-ink-muted">Ask your Owner to upgrade the plan.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Small warm pill that points Owners to the plans page. */
export function UpgradeChip({
  orgSlug,
  label = "Upgrade",
  className,
}: {
  orgSlug: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={`/${orgSlug}/settings/billing`}
      className={cn(
        "inline-flex items-center rounded-full bg-surface px-2.5 py-[3px] text-[0.72rem] font-bold text-warning-ink shadow-glow outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      {label}
    </Link>
  );
}
