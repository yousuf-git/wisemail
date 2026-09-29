"use client";

import * as m from "motion/react-m";
import { around, createAnimatedIcon, iconEase } from "./base";

/** The clock hand sweeps a full turn. */
export const ClockIcon = createAnimatedIcon("ClockIcon", (part) => (
  <>
    <circle cx="12" cy="12" r="10" />
    <m.path
      d="M12 6v6l4 2"
      style={around(12, 12)}
      {...part({
        normal: { rotate: 0 },
        animate: { rotate: 360, transition: { duration: 0.7, ease: iconEase } },
      })}
    />
  </>
));
