"use client";

import * as m from "motion/react-m";
import { createAnimatedIcon, iconEase } from "./base";

/** The arrow drops into the tray. */
export const DownloadIcon = createAnimatedIcon("DownloadIcon", (part) => (
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <m.g
      {...part({
        normal: { y: 0, opacity: 1 },
        animate: {
          y: [-5, 1, 0],
          opacity: [0, 1, 1],
          transition: { duration: 0.5, ease: iconEase },
        },
      })}
    >
      <path d="M12 15V3" />
      <path d="m7 10 5 5 5-5" />
    </m.g>
  </>
));
