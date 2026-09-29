"use client";

import * as m from "motion/react-m";
import { around, createAnimatedIcon, iconSpring } from "./base";

/** Rotates 30 degrees. */
export const GlobeIcon = createAnimatedIcon("GlobeIcon", (part) => (
  <m.g
    style={around(12, 12)}
    {...part({
      normal: { rotate: 0 },
      animate: { rotate: 30, transition: { ...iconSpring, duration: 0.6 } },
    })}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </m.g>
));
