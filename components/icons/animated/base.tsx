"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import {
  useAnimation,
  useReducedMotion,
  type LegacyAnimationControls,
  type Variants,
} from "motion/react";

/**
 * Motion-based Lucide icons in the lucide-animated pattern.
 *
 * Every icon animates when its host (nearest link, button, menu item or
 * `[data-icon-trigger]`) is hovered or keyboard-focused, and exposes imperative
 * `startAnimation()` / `stopAnimation()` through a ref (e.g. ring the bell when
 * a notification arrives). Under `prefers-reduced-motion` nothing moves.
 */
export type AnimatedIconHandle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};

export type AnimatedIconProps = Omit<React.SVGProps<SVGSVGElement>, "ref"> & {
  /** Pixel size (width and height). Default 18. */
  size?: number;
  /**
   * `parent` (default): animate when the closest interactive ancestor is hovered or focused.
   * `self`: animate when the icon itself is hovered. `manual`: only via the ref.
   */
  trigger?: "parent" | "self" | "manual";
};

/** Spring used for icon micro-interactions (FED §9.1). */
export const iconSpring = { type: "spring", stiffness: 320, damping: 22 } as const;
export const iconEase = [0.2, 0.8, 0.2, 1] as const;

/** Props to spread on a `m.*` part so it follows the icon's controls. */
export type PartProps = {
  variants: Variants;
  initial: "normal";
  animate: LegacyAnimationControls;
};
export type PartFactory = (variants: Variants) => PartProps;

const HOST_SELECTOR = "a,button,[role='menuitem'],[data-icon-trigger]";

export function createAnimatedIcon(
  displayName: string,
  render: (part: PartFactory) => React.ReactNode,
) {
  const Icon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(function AnimatedIcon(
    { size = 18, trigger = "parent", className, strokeWidth = 1.75, ...props },
    ref,
  ) {
    const controls = useAnimation();
    const reduced = useReducedMotion();
    const svgRef = useRef<SVGSVGElement>(null);

    const startAnimation = useCallback(() => {
      if (reduced) return;
      void controls.start("animate");
    }, [controls, reduced]);

    const stopAnimation = useCallback(() => {
      void controls.start("normal");
    }, [controls]);

    useImperativeHandle(ref, () => ({ startAnimation, stopAnimation }), [
      startAnimation,
      stopAnimation,
    ]);

    useEffect(() => {
      if (trigger === "manual") return;
      const svg = svgRef.current;
      if (!svg) return;
      const host = trigger === "self" ? svg : (svg.closest(HOST_SELECTOR) ?? svg);
      const on = () => startAnimation();
      const off = () => stopAnimation();
      host.addEventListener("pointerenter", on);
      host.addEventListener("focusin", on);
      host.addEventListener("pointerleave", off);
      host.addEventListener("focusout", off);
      return () => {
        host.removeEventListener("pointerenter", on);
        host.removeEventListener("focusin", on);
        host.removeEventListener("pointerleave", off);
        host.removeEventListener("focusout", off);
      };
    }, [trigger, startAnimation, stopAnimation]);

    const part: PartFactory = (variants) => ({ variants, initial: "normal", animate: controls });

    return (
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={props["aria-label"] ? undefined : true}
        className={className}
        style={{ overflow: "visible", flex: "none" }}
        {...props}
      >
        {render(part)}
      </svg>
    );
  });
  Icon.displayName = displayName;
  return Icon;
}

/** Rotate around a point in viewBox units. */
export const around = (x: number, y: number) =>
  ({ transformBox: "view-box", transformOrigin: `${x}px ${y}px` }) as const;
