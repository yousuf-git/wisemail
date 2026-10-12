"use client";

import * as m from "motion/react-m";
import { around, createAnimatedIcon, iconEase } from "./base";

/** Turns like in a lock. */
export const KeyIcon = createAnimatedIcon("KeyIcon", (part) => (
  <m.g
    style={around(12, 12)}
    {...part({
      normal: { rotate: 0 },
      animate: { rotate: [0, -24, 0], transition: { duration: 0.5, ease: iconEase } },
    })}
  >
    <path d="m2 21 9.6-9.6" />
    <path d="m7.5 15.5 2.3 2.3a1 1 0 0 1 0 1.4l-2.1 2.1a1 1 0 0 1-1.4 0L4 19" />
    <circle cx="15.5" cy="7.5" r="5.5" />
  </m.g>
));
