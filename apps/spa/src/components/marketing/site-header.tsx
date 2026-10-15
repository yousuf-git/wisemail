import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useRef, useState } from "react";

import { Logo } from "./logo";
import { navLinks } from "./nav-links";
import { Container, easeOut } from "./section";
import { SectionLink } from "./smooth-scroll";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  // Close on Escape or a tap anywhere outside the header.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <header ref={headerRef} className="sticky top-0 z-40 pt-4 sm:pt-5">
      <Container className="relative">
        <div className="flex h-14 items-center justify-between gap-4 rounded-full border border-line/70 bg-surface/95 px-3 shadow-md backdrop-blur-md supports-[backdrop-filter]:bg-surface/85 sm:px-4">
          <div className="flex min-w-0 items-center gap-6 pl-1">
            <Logo className="text-base sm:text-lg" />
            <nav aria-label="Main" className="hidden items-center gap-0.5 md:flex">
              {navLinks.map((l) => (
                <SectionLink
                  key={l.section}
                  section={l.section}
                  className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-secondary transition-colors duration-300 hover:bg-canvas-sunken hover:text-ink"
                >
                  {l.label}
                </SectionLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              to="/sign-in"
              className="hidden rounded-full px-3 py-1.5 text-sm font-medium text-ink-secondary hover:text-ink sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              to="/sign-up"
              className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-sm font-semibold text-canvas transition-transform active:scale-[0.97]"
            >
              Start free
            </Link>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-full border border-line md:hidden"
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
            >
              <AnimatePresence mode="wait" initial={false}>
                <m.span
                  key={open ? "close" : "open"}
                  className="grid place-items-center"
                  initial={{ opacity: 0, rotate: -45, scale: 0.7 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 45, scale: 0.7 }}
                  transition={{ duration: 0.18 }}
                >
                  {open ? <X className="size-4" /> : <Menu className="size-4" />}
                </m.span>
              </AnimatePresence>
            </button>
          </div>
        </div>
        {/* Overlay under the pill: floats over the page instead of pushing it down. */}
        <AnimatePresence>
          {open ? (
            <m.nav
              aria-label="Mobile"
              className="absolute inset-x-5 top-full mt-2 grid origin-top gap-1 rounded-2xl border border-line bg-surface/95 p-2 shadow-lg backdrop-blur-md sm:inset-x-8 md:hidden"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.28, ease: easeOut }}
            >
              {[...navLinks.map((l) => ({ ...l, kind: "section" as const })), { label: "Sign in", kind: "page" as const }].map(
                (item, i) => (
                  <m.div
                    key={item.label}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.04 + i * 0.035, ease: easeOut }}
                  >
                    {item.kind === "section" ? (
                      <SectionLink
                        section={item.section}
                        onClick={() => setOpen(false)}
                        className="block rounded-xl px-3 py-2.5 text-[0.9375rem] font-medium hover:bg-canvas-sunken"
                      >
                        {item.label}
                      </SectionLink>
                    ) : (
                      <Link
                        to="/sign-in"
                        onClick={() => setOpen(false)}
                        className="block rounded-xl px-3 py-2.5 text-[0.9375rem] font-medium hover:bg-canvas-sunken"
                      >
                        {item.label}
                      </Link>
                    )}
                  </m.div>
                ),
              )}
            </m.nav>
          ) : null}
        </AnimatePresence>
      </Container>
    </header>
  );
}
