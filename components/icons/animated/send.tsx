"use client";

import * as m from "motion/react-m";
import { createAnimatedIcon, iconEase } from "./base";

/** Plane lifts off to the top-right and returns. */
export const SendIcon = createAnimatedIcon("SendIcon", (part) => (
  <m.g
    {...part({
      normal: { x: 0, y: 0, scale: 1, opacity: 1 },
      animate: {
        x: [0, 6, -6, 0],
        y: [0, -6, 6, 0],
        scale: [1, 0.8, 0.8, 1],
        opacity: [1, 0, 0, 1],
        transition: { duration: 0.55, times: [0, 0.45, 0.55, 1], ease: iconEase },
      },
    })}
  >
    <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
    <path d="m21.854 2.147-10.94 10.939" />
  </m.g>
));
