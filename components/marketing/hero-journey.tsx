"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { useSeen, useStepper } from "./motion-hooks";

const stages = [
  { label: "Sent", tone: "text-info-ink" },
  { label: "Delivered", tone: "text-success-ink" },
  { label: "Opened", tone: "text-engaged-ink" },
] as const;

/**
 * The product idea without app chrome: a live receipt journey as typography.
 * Stages light in sequence; the last one blooms into a quiet confirmation.
 */
export function HeroJourney() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.25);
  const { step } = useStepper([900, 2000, 3400, 4200], seen);
  const reached = Math.min(step, 3);
  const lineRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const line = lineRef.current;
    if (!line) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(line, { scaleX: reached / 3 });
      return;
    }
    gsap.to(line, {
      scaleX: reached / 3,
      duration: 0.7,
      ease: "power3.out",
      overwrite: "auto",
    });
  }, [reached]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="A reply moves from Sent to Delivered to Opened."
      className="relative w-full"
    >
      <div className="relative grid gap-6 sm:gap-8">
        <div className="relative h-px w-full bg-line-strong/60">
          <span
            ref={lineRef}
            aria-hidden
            className="absolute inset-y-0 left-0 origin-left bg-accent-fill"
            style={{ width: "100%", transform: "scaleX(0)" }}
          />
        </div>

        <ol className="grid grid-cols-3 gap-3 sm:gap-6">
          {stages.map((s, i) => {
            const on = reached > i;
            const active = reached === i + 1;
            return (
              <li key={s.label} className="min-w-0">
                <p
                  className={cn(
                    "font-display text-[clamp(1.35rem,4.5vw,3.25rem)] leading-none font-bold tracking-[-0.05em] transition-[color,opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    on ? s.tone : "text-ink-faint/55",
                    active && "translate-y-[-2px]",
                  )}
                >
                  {s.label}
                </p>
                <p
                  className={cn(
                    "mt-2 text-[0.6875rem] font-medium tracking-[0.16em] uppercase transition-opacity duration-500",
                    on ? "text-ink-muted opacity-100" : "opacity-0",
                  )}
                >
                  {i === 0 ? "09:41:02" : i === 1 ? "09:41:04" : "just now"}
                </p>
              </li>
            );
          })}
        </ol>

        <p
          aria-live="polite"
          className={cn(
            "font-display text-sm font-semibold tracking-[-0.02em] text-engaged-ink transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] sm:text-base",
            step >= 4 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
          )}
        >
          Jane opened your reply
        </p>
      </div>
    </div>
  );
}
