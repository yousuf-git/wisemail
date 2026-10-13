"use client";

import * as m from "motion/react-m";
import { createAnimatedIcon } from "./base";

/** The two figures nudge apart. */
export const UsersIcon = createAnimatedIcon("UsersIcon", (part) => (
  <>
    <m.g
      {...part({
        normal: { x: 0 },
        animate: { x: [0, -2, 0], transition: { duration: 0.45, ease: "easeInOut" } },
      })}
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </m.g>
    <m.g
      {...part({
        normal: { x: 0 },
        animate: { x: [0, 2, 0], transition: { duration: 0.45, ease: "easeInOut" } },
      })}
    >
      <path d="M16 3.128a4 4 0 0 1 0 7.744" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    </m.g>
  </>
));
