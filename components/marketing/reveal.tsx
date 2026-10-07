"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";

import { MotionProvider } from "@/components/app/motion-provider";
import { cn } from "@/lib/utils";

export { MotionProvider };

gsap.registerPlugin(ScrollTrigger);

/** Fades and lifts once into view. Reduced motion: visible immediately. */
export function Reveal({
  children,
  delay = 0,
  className,
  y = 36,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(el, { clearProps: "all", opacity: 1, y: 0, filter: "none" });
      return;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y, filter: "blur(6px)" },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.95,
          delay,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top 90%",
            once: true,
          },
        },
      );
    }, el);

    return () => ctx.revert();
  }, [delay, y]);

  return (
    <div
      ref={ref}
      className={cn("min-w-0", className)}
      data-reveal
      style={{ opacity: 0 }}
    >
      {children}
    </div>
  );
}
