"use client";

import * as m from "motion/react-m";
import { createAnimatedIcon, iconEase } from "./base";

/** The pulse line draws left to right. */
export const ActivityIcon = createAnimatedIcon("ActivityIcon", (part) => (
  <m.path
    d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"
    {...part({
      normal: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0.4, 1],
        transition: { duration: 0.7, ease: iconEase },
      },
    })}
  />
));
