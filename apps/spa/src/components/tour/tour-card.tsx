import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Wizi, type WiziMood } from "@/components/mascot/wizi";
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

export function TourCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
}: {
  step: { title: string; content: string; icon?: string };
  currentStep: number;
  totalSteps: number;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
}) {
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
        <Wizi mood={moodOf(step.icon)} size={64} />
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
          <button
            type="button"
            onClick={prevStep}
            className="rounded-control px-2.5 py-1 text-sm font-medium text-ink-secondary hover:bg-canvas-sunken hover:text-ink"
          >
            Back
          </button>
        ) : null}
        <button
          ref={primary}
          type="button"
          onClick={nextStep}
          className="rounded-control bg-accent-fill px-3 py-1 text-sm font-bold text-accent-ink hover:bg-accent-fill-hover"
        >
          {last ? "Finish" : "Next"}
        </button>
      </div>
      <button
        type="button"
        onClick={skipTour}
        className="justify-self-start text-[0.8125rem] text-ink-muted underline-offset-2 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-accent"
      >
        Skip tour
      </button>
    </section>
  );

  return docked && typeof document !== "undefined" ? createPortal(card, document.body) : card;
}
