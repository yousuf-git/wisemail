import { Check, CircleHelp, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useTours } from "./tour-context";

/** Help menu (the "?" in the top bar): tours available to this member. */
export function TourMenu({ className }: { className?: string }) {
  const api = useTours();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!api || api.tours.length === 0) return null;

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        aria-label="Help and tours"
        aria-expanded={open}
        data-tour="help"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink-secondary shadow-sm ring-1 ring-line outline-none transition-[transform,background-color] duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.97]"
        onClick={() => setOpen((v) => !v)}
      >
        <CircleHelp aria-hidden className="size-[18px]" />
      </button>
      {open ? (
        <div className="absolute top-full right-0 z-50 mt-2 w-72 rounded-lg border border-line bg-surface p-1 shadow-lg">
          <p className="px-2 py-1.5 text-xs font-semibold tracking-[0.06em] text-ink-muted uppercase">
            Tours
          </p>
          {api.tours.map((tour) => (
            <button
              key={tour.id}
              type="button"
              className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left hover:bg-canvas-sunken"
              onClick={() => {
                setOpen(false);
                api.start(tour.id);
              }}
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
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-sm font-semibold">
                  {tour.name}
                  <span className="sr-only">{tour.completed ? " (completed)" : ""}</span>
                </span>
                <span className="text-xs text-ink-muted">{tour.description}</span>
              </span>
              <span className="self-center text-xs font-semibold text-info-ink">
                {tour.completed || tour.status ? "Replay" : "Start"}
              </span>
            </button>
          ))}
          <p className="border-t border-line px-2 py-1.5 text-xs text-ink-muted">
            During a tour: ← and → move, Esc skips.
          </p>
        </div>
      ) : null}
    </div>
  );
}
