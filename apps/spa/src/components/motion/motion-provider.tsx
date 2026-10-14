import { createContext, useContext, useSyncExternalStore } from "react";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";

type MotionContextValue = { reduceMotion: boolean };

const MotionContext = createContext<MotionContextValue>({ reduceMotion: false });

function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * Motion LazyMotion + reduced-motion for every `m.*` below.
 * Also exposes `useReduceMotion` for non-Motion callers.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const reduceMotion = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <MotionContext.Provider value={{ reduceMotion }}>{children}</MotionContext.Provider>
      </MotionConfig>
    </LazyMotion>
  );
}

export function useReduceMotion() {
  return useContext(MotionContext).reduceMotion;
}
