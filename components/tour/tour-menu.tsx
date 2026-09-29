"use client";

import { Check, CircleHelp, Play } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTours } from "./tour-context";

const iconButton =
  "grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink-secondary shadow-sm ring-1 ring-line outline-none transition-[transform,background-color] duration-150 ease-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.97]";

/** Help menu (the "?" in the top bar): tours available to this member, with "Replay" (FED §9A). */
export function TourMenu({ className }: { className?: string }) {
  const api = useTours();
  if (!api || api.tours.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Help and tours"
        data-tour="help"
        className={cn(iconButton, className)}
      >
        <CircleHelp aria-hidden className="size-[18px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-lg shadow-lg">
        <DropdownMenuLabel className="text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
          Tours
        </DropdownMenuLabel>
        {api.tours.map((tour) => (
          <DropdownMenuItem
            key={tour.id}
            onSelect={() => api.start(tour.id)}
            className="items-start gap-3 py-2"
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                tour.completed
                  ? "bg-success-soft text-success-ink"
                  : "bg-canvas-sunken text-ink-muted",
              )}
            >
              {tour.completed ? (
                <Check className="size-3" strokeWidth={3} />
              ) : (
                <Play className="size-3" />
              )}
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span className="text-sm font-semibold">
                {tour.name}
                <span className="sr-only">{tour.completed ? " (completed)" : ""}</span>
              </span>
              <span className="text-xs text-ink-muted">{tour.description}</span>
            </span>
            <span className="ml-auto self-center text-xs font-semibold text-info-ink">
              {tour.completed || tour.status ? "Replay" : "Start"}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-ink-muted">
          During a tour: ← and → move, Esc skips.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
