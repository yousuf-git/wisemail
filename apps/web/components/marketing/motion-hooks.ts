"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

/** True once the element has scrolled into view (and stays true). */
export function useSeen<T extends Element>(amount = 0.4) {
  const ref = useRef<T>(null);
  const seen = useInView(ref, { once: true, amount });
  return [ref, seen] as const;
}

/**
 * Steps a small product animation forward once `run` is true: step n is reached `delays[n-1]` ms
 * after the start. Reduced motion jumps straight to the final state. `set` lets a click jump ahead,
 * `replay` starts over.
 */
export function useStepper(delays: readonly number[], run: boolean) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [round, setRound] = useState(0);
  const key = delays.join(",");

  useEffect(() => {
    if (!run || reduced) return;
    const timers = key
      .split(",")
      .map((d, i) => window.setTimeout(() => setStep((s) => Math.max(s, i + 1)), Number(d)));
    return () => timers.forEach(window.clearTimeout);
  }, [run, reduced, round, key]);

  const replay = useCallback(() => {
    setStep(0);
    setRound((r) => r + 1);
  }, []);
  const set = useCallback((n: number) => setStep((s) => Math.max(s, n)), []);

  return { step: reduced ? delays.length : step, replay, set, reduced: !!reduced };
}
