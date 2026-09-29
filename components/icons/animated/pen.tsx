"use client";

import * as m from "motion/react-m";
import { around, createAnimatedIcon, iconEase } from "./base";

/** The pen scribbles. */
export const PenIcon = createAnimatedIcon("PenIcon", (part) => (
  <m.path
    d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
    style={around(3, 21)}
    {...part({
      normal: { rotate: 0 },
      animate: { rotate: [0, -10, 8, -3, 0], transition: { duration: 0.5, ease: iconEase } },
    })}
  />
));
