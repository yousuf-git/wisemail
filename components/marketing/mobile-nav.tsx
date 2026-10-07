"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { navLinks } from "./nav-links";

/** Full-screen glass menu with staggered link reveal. */
export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-9 place-items-center rounded-full text-ink transition-colors hover:bg-canvas-sunken focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Menu
          className={cn(
            "size-5 transition-all duration-300 ease-soft",
            open ? "scale-75 rotate-90 opacity-0" : "opacity-100",
          )}
          aria-hidden
        />
        <X
          className={cn(
            "absolute size-5 transition-all duration-300 ease-soft",
            open ? "scale-100 opacity-100" : "scale-75 -rotate-90 opacity-0",
          )}
          aria-hidden
        />
      </button>

      <div
        id="mobile-nav"
        className={cn(
          "fixed inset-0 z-50 bg-canvas/92 backdrop-blur-2xl transition-opacity duration-300 ease-soft",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col px-6 pt-20 pb-10">
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={open ? 0 : -1}
            onClick={() => setOpen(false)}
            className="absolute top-5 right-5 grid size-10 place-items-center rounded-full border border-line bg-surface"
          >
            <X className="size-5" aria-hidden />
          </button>
          <nav aria-label="Mobile" className="grid gap-1">
            {navLinks.map((l, i) => (
              <Link
                key={l.href}
                href={l.href}
                tabIndex={open ? 0 : -1}
                onClick={() => setOpen(false)}
                style={{ transitionDelay: open ? `${90 + i * 55}ms` : "0ms" }}
                className={cn(
                  "rounded-2xl px-2 py-4 font-display text-3xl font-bold tracking-[-0.03em] text-ink transition-all duration-500 ease-soft",
                  open ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div
            className={cn(
              "mt-auto border-t border-line pt-6 transition-opacity duration-500 ease-soft",
              open ? "opacity-100 delay-200" : "opacity-0",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
