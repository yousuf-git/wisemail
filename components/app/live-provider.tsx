"use client";

import { cn } from "@/lib/utils";
import { useLiveStatus } from "@/lib/realtime/live-context";

export { LiveProvider } from "@/lib/realtime/live-context";

const labels = {
  live: "Live: updates arrive by themselves",
  connecting: "Connecting to live updates",
  offline: "Offline: reconnecting to live updates",
  paused: "Live updates paused while this tab is in the background",
} as const;

/** Small dot that pulses gently while the realtime stream is connected (FED §9.3). */
export function LiveDot({ className }: { className?: string }) {
  const status = useLiveStatus();
  if (!status) return null;
  const live = status === "live";
  return (
    <span
      role="img"
      aria-label={labels[status]}
      title={labels[status]}
      data-testid="live-dot"
      data-status={status}
      className={cn("relative inline-grid size-2 shrink-0 place-items-center", className)}
    >
      {live ? (
        <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
      ) : null}
      <span className={cn("relative size-2 rounded-full", live ? "bg-success" : "bg-neutral")} />
    </span>
  );
}
