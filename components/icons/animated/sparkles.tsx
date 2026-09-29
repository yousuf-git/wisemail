"use client";

import * as m from "motion/react-m";
import { createAnimatedIcon, iconEase } from "./base";

const twinkle = (delay: number) => ({
  normal: { scale: 1, rotate: 0, opacity: 1 },
  animate: {
    scale: [1, 0.65, 1.1, 1],
    rotate: [0, 20, 0, 0],
    opacity: [1, 0.7, 1, 1],
    transition: { duration: 0.6, delay, ease: iconEase },
  },
});

/** Sparkles twinkle. */
export const SparklesIcon = createAnimatedIcon("SparklesIcon", (part) => (
  <>
    <m.path
      d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
      {...part(twinkle(0))}
    />
    <m.path d="M20 2v4" {...part(twinkle(0.1))} />
    <m.path d="M22 4h-4" {...part(twinkle(0.1))} />
    <m.circle cx="4" cy="20" r="2" {...part(twinkle(0.2))} />
  </>
));
