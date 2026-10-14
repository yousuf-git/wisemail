import { useEffect, useState, useSyncExternalStore } from "react";

import type { WiziMood } from "@/components/mascot/wizi";
import { cn } from "@/lib/utils";

const BEATS = [
  { caption: "Sent", mood: "idle" as WiziMood },
  { caption: "Delivered", mood: "happy" as WiziMood },
  { caption: "Opened · Jane", mood: "wow" as WiziMood },
] as const;

const DELAYS_MS = [1000, 2400, 3800] as const;
const LOOP_MS = 6800;

function subscribeReduced(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const getReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const getReducedServer = () => false;

/** Shared journey clock — Wizi mood + receipt stamp. */
export function useHeroJourney() {
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, getReducedServer);
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (reduced) {
      setBeat(2);
      return;
    }
    let cancelled = false;
    let timers: number[] = [];
    let loop = 0;

    const run = () => {
      if (cancelled) return;
      setBeat(-1);
      timers.forEach(window.clearTimeout);
      timers = DELAYS_MS.map((ms, i) =>
        window.setTimeout(() => {
          if (!cancelled) setBeat(i);
        }, ms),
      );
      loop = window.setTimeout(run, LOOP_MS);
    };

    run();
    return () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
      window.clearTimeout(loop);
    };
  }, [reduced]);

  const index = Math.max(0, beat);
  return {
    mood: BEATS[index]?.mood ?? "idle",
    caption: beat < 0 ? "" : BEATS[index].caption,
    active: beat >= 0,
  };
}

/**
 * Paper receipt stamp — email vernacular, not a progress UI.
 * Sits in the composition near Wizi.
 */
export function HeroStamp({
  caption,
  active,
  className,
}: {
  caption: string;
  active: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "origin-center rotate-[-3deg] rounded-[0.35rem] border border-[color:var(--paper-fold)] bg-[color:var(--paper)] px-3 py-2 shadow-[0_10px_28px_-12px_rgb(60_45_20_/0.28)] transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        active && caption
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0",
        className,
      )}
    >
      <p className="font-mono text-[0.6875rem] leading-none tracking-[0.02em] text-[color:var(--paper-line)] tabular-nums sm:text-xs">
        {caption || "\u00a0"}
      </p>
    </div>
  );
}
