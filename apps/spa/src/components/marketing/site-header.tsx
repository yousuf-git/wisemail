import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";

import { Logo } from "./logo";
import { navLinks } from "./nav-links";
import { Container } from "./section";

function NavAnchor({
  href,
  label,
  className,
  onClick,
}: {
  href: string;
  label: string;
  className?: string;
  onClick?: () => void;
}) {
  if (href.startsWith("/#") || href === "/") {
    return (
      <a href={href} className={className} onClick={onClick}>
        {label}
      </a>
    );
  }
  return (
    <Link to={href} className={className} onClick={onClick}>
      {label}
    </Link>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 pt-4 sm:pt-5">
      <Container>
        <div className="flex h-14 items-center justify-between gap-4 rounded-full border border-line/70 bg-surface/80 px-3 shadow-md backdrop-blur-xl supports-[backdrop-filter]:bg-surface/65 sm:px-4">
          <div className="flex min-w-0 items-center gap-6 pl-1">
            <Logo className="text-base sm:text-lg" />
            <nav aria-label="Main" className="hidden items-center gap-0.5 md:flex">
              {navLinks.map((l) => (
                <NavAnchor
                  key={l.href}
                  href={l.href}
                  label={l.label}
                  className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-secondary transition-colors duration-300 hover:bg-canvas-sunken hover:text-ink"
                />
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
              className="inline-flex h-9 items-center rounded-full bg-accent-fill px-4 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover"
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
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>
        {open ? (
          <nav
            aria-label="Mobile"
            className="mt-2 grid gap-1 rounded-2xl border border-line bg-surface p-3 shadow-md md:hidden"
          >
            {navLinks.map((l) => (
              <NavAnchor
                key={l.href}
                href={l.href}
                label={l.label}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-canvas-sunken"
              />
            ))}
            <Link
              to="/sign-in"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-canvas-sunken"
            >
              Sign in
            </Link>
          </nav>
        ) : null}
      </Container>
    </header>
  );
}
