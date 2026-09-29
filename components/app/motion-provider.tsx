"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";

/**
 * Loads Motion's DOM feature set lazily and honours `prefers-reduced-motion`
 * for every `m.*` component below it (transforms are skipped, opacity and color stay).
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
