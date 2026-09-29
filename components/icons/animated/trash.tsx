"use client";

import * as m from "motion/react-m";
import { around, createAnimatedIcon, iconEase } from "./base";

/** The lid lifts and settles. */
export const TrashIcon = createAnimatedIcon("TrashIcon", (part) => (
  <>
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <m.g
      style={around(4, 6)}
      {...part({
        normal: { y: 0, rotate: 0 },
        animate: {
          y: [0, -3, 0],
          rotate: [0, -14, 0],
          transition: { duration: 0.5, ease: iconEase },
        },
      })}
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </m.g>
  </>
));
