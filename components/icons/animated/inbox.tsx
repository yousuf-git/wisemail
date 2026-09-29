"use client";

import * as m from "motion/react-m";
import { createAnimatedIcon, iconEase, iconSpring } from "./base";

/** Tray dips and a letter drops in. */
export const InboxIcon = createAnimatedIcon("InboxIcon", (part) => (
  <>
    <m.g
      {...part({
        normal: { y: 0 },
        animate: { y: [0, 2, 0], transition: { ...iconSpring, duration: 0.5 } },
      })}
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </m.g>
    <m.path
      d="M9.5 7h5"
      {...part({
        normal: { opacity: 0, y: -5 },
        animate: {
          opacity: [0, 1, 1, 0],
          y: [-5, 0, 0, 1],
          transition: { duration: 0.5, ease: iconEase },
        },
      })}
    />
  </>
));
