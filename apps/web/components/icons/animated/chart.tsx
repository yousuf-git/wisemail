"use client";

import * as m from "motion/react-m";
import { around, createAnimatedIcon, iconEase } from "./base";

const bars = [
  { d: "M8 17v-3", x: 8 },
  { d: "M13 17V5", x: 13 },
  { d: "M18 17V9", x: 18 },
];

/** Bars regrow from zero in sequence. */
export const ChartIcon = createAnimatedIcon("ChartIcon", (part) => (
  <>
    <path d="M3 3v18h18" />
    {bars.map((bar, i) => (
      <m.path
        key={bar.d}
        d={bar.d}
        style={around(bar.x, 17)}
        {...part({
          normal: { scaleY: 1 },
          animate: {
            scaleY: [0, 1],
            transition: { duration: 0.45, delay: i * 0.07, ease: iconEase },
          },
        })}
      />
    ))}
  </>
));
