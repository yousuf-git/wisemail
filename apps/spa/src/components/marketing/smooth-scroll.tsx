import { useLocation, useNavigate } from "@tanstack/react-router";
import Lenis from "lenis";
import { useEffect } from "react";

import "lenis/dist/lenis.css";

let lenis: Lenis | null = null;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let tween = 0;

/**
 * Our own eased tween for when Lenis is not running. Native `behavior: "smooth"` is not
 * used because some browsers (Chrome on Linux by default) turn it into an instant jump.
 */
function tweenTo(target: number) {
  cancelAnimationFrame(tween);
  const start = window.scrollY;
  const distance = target - start;
  const ms = glideDuration(distance) * 1000;
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms);
    window.scrollTo(0, start + distance * easeInOutCubic(t));
    if (t < 1) tween = requestAnimationFrame(step);
  };
  tween = requestAnimationFrame(step);
}

/** Glide to an absolute scroll position. */
export function scrollToY(y: number) {
  if (lenis) {
    lenis.scrollTo(y, {
      duration: glideDuration(y - window.scrollY),
      easing: easeInOutCubic,
      force: true,
    });
  } else if (reducedMotion()) window.scrollTo(0, y);
  else tweenTo(y);
}

/** Where a section starts, honouring its scroll-margin (clears the floating header). */
function sectionTop(el: HTMLElement) {
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  return el.getBoundingClientRect().top + window.scrollY - margin;
}

/** Ease in and out so long trips read as travel, not a cut. */
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Longer trips take a little longer, within a range that never feels sluggish. */
const glideDuration = (distance: number) =>
  Math.min(2.2, Math.max(1.1, 0.9 + Math.abs(distance) / 4500));

/** Glide to a section by id. Returns false when the section is not on this page. */
export function scrollToSection(id: string) {
  const el = id === "top" ? null : document.getElementById(id);
  if (id !== "top" && !el) return false;
  scrollToY(el ? sectionTop(el) : 0);
  return true;
}

/**
 * In-page link to a landing section. On the landing page it glides there; elsewhere it
 * routes home first and the landing page finishes the glide from the hash.
 */
export function SectionLink({
  section,
  className,
  children,
  onClick,
}: {
  section: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <a
      href={section === "top" ? "/" : `/#${section}`}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onClick?.();
        if (pathname === "/" && scrollToSection(section)) return;
        // The landing page glides to the hash itself (useHashGlide); stop the router jumping there.
        void navigate({
          to: "/",
          hash: section === "top" ? undefined : section,
          hashScrollIntoView: false,
        });
      }}
    >
      {children}
    </a>
  );
}

/** On arrival at the landing page with a hash, glide to that section once it has rendered. */
export function useHashGlide() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const t = window.setTimeout(() => scrollToSection(hash), 120);
    return () => window.clearTimeout(t);
  }, [hash]);
}

/** Lenis smooth wheel. No-op when reduced motion is on. */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (reducedMotion()) return;

    const instance = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.4,
    });
    lenis = instance;

    let raf = 0;
    const frame = (time: number) => {
      instance.raf(time);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      instance.destroy();
      if (lenis === instance) lenis = null;
    };
  }, []);

  return <>{children}</>;
}
