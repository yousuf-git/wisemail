"use client";

import * as m from "motion/react-m";

import { cn } from "@/lib/utils";

import { MotionProvider } from "@/components/app/motion-provider";

export { MotionProvider };

/** Fades and lifts its children in once, when they scroll into view. Reduced motion: fade only. */
export function Reveal({
  children,
  delay = 0,
  className,
  y = 18,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  return (
    <m.div
      className={cn("min-w-0", className)}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1], delay }}
    >
      {children}
    </m.div>
  );
}
