import Link from "next/link";
import { Suspense } from "react";

import { ActionButtons, HeaderActions } from "./header-actions";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { navLinks } from "./nav-links";
import { Container } from "./section";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/70">
      <Container className="relative flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-2 text-sm font-semibold text-ink-secondary transition-colors duration-150 hover:bg-canvas-sunken hover:text-ink"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Suspense fallback={<ActionButtons signedIn={false} variant="bar" />}>
            <HeaderActions variant="bar" />
          </Suspense>
          <Suspense fallback={<ActionButtons signedIn={false} variant="compact" />}>
            <HeaderActions variant="compact" />
          </Suspense>
          <MobileNav>
            <Suspense fallback={<ActionButtons signedIn={false} variant="stack" />}>
              <HeaderActions variant="stack" />
            </Suspense>
          </MobileNav>
        </div>
      </Container>
    </header>
  );
}
