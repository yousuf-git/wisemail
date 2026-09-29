"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CardComponentProps } from "nextstepjs";

import { MotionProvider } from "@/components/app/motion-provider";
import type { WiziMood } from "@/components/mascot/moods";
import { Wizi } from "@/components/mascot/wizi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MOODS: readonly string[] = [
  "idle",
  "happy",
  "wow",
  "sleep",
  "thinking",
  "worried",
  "detective",
];
const moodOf = (icon: unknown): WiziMood =>
  typeof icon === "string" && MOODS.includes(icon) ? (icon as WiziMood) : "idle";

/** Below 640 px the card docks as a bottom sheet (FED §9A). */
function useDocked(): boolean {
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setDocked(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return docked;
}

/**
 * The tour card (FED §9A): Wizi at 64 px in a pose that matches the step, title, one or two
 * sentences, step dots, Back / Next / Finish and a quiet "Skip tour". Arrow keys move and Escape
 * skips (NextStepjs listens for them); focus follows the primary button so the keyboard always has
 * a place to land. The step's `icon` carries the Wizi mood.
 */
export function TourCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) {
  const docked = useDocked();
  const primary = useRef<HTMLButtonElement>(null);
  const last = currentStep === totalSteps - 1;

  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
  }, [currentStep]);

  const card = (
    <section
      role="dialog"
      aria-modal="false"
      aria-label={`Product tour: ${step.title}`}
      data-testid="tour-card"
      className={cn(
        "pointer-events-auto grid gap-3 rounded-xl bg-surface p-4 text-ink shadow-lg ring-1 ring-line",
        docked
          ? "fixed inset-x-3 bottom-3 z-[1000] max-h-[60dvh] overflow-y-auto rounded-2xl"
          : "w-[min(360px,calc(100vw-2rem))]",
      )}
    >
      <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-3">
        {/* NextStepjs renders us outside the app shell, so Wizi brings its own motion features. */}
        <MotionProvider>
          <Wizi mood={moodOf(step.icon)} size={64} interactive={false} />
        </MotionProvider>
        <div className="grid gap-1" aria-live="polite">
          <h3 className="text-[1.0625rem] leading-6 font-semibold tracking-[-0.01em]">
            {step.title}
          </h3>
          <p className="text-[0.9375rem] leading-[1.45] text-ink-secondary">{step.content}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ol
          aria-label={`Step ${currentStep + 1} of ${totalSteps}`}
          className="mr-auto flex items-center gap-1.5"
        >
          {Array.from({ length: totalSteps }, (_, i) => (
            <li
              key={i}
              aria-current={i === currentStep ? "step" : undefined}
              className={cn(
                "size-1.5 rounded-full transition-colors duration-150",
                i === currentStep
                  ? "bg-accent"
                  : i < currentStep
                    ? "bg-accent/40"
                    : "bg-line-strong",
              )}
            />
          ))}
        </ol>
        {currentStep > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={prevStep}>
            Back
          </Button>
        ) : null}
        <Button ref={primary} type="button" size="sm" onClick={nextStep} className="font-bold">
          {last ? "Finish" : "Next"}
        </Button>
      </div>
      <button
        type="button"
        onClick={skipTour}
        className="justify-self-start text-[0.8125rem] text-ink-muted underline-offset-2 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-accent"
      >
        Skip tour
      </button>
      {docked ? null : arrow}
    </section>
  );

  return docked && typeof document !== "undefined" ? createPortal(card, document.body) : card;
}
