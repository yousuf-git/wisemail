import Link from "next/link";

import { HeaderActions } from "./header-actions";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { navLinks } from "./nav-links";
import { Container } from "./section";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 pt-4 sm:pt-5">
      <Container>
        <div className="flex h-14 items-center justify-between gap-4 rounded-full border border-line/70 bg-surface/80 px-3 shadow-md backdrop-blur-xl supports-[backdrop-filter]:bg-surface/65 sm:px-4">
          <div className="flex min-w-0 items-center gap-6 pl-1">
            <Logo className="text-base sm:text-lg" />
            <nav aria-label="Main" className="hidden items-center gap-0.5 md:flex">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-secondary transition-colors duration-300 ease-soft hover:bg-canvas-sunken hover:text-ink"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
            <HeaderActions variant="bar" />
            <HeaderActions variant="compact" />
            <MobileNav>
              <HeaderActions variant="stack" />
            </MobileNav>
          </div>
        </div>
      </Container>
    </header>
  );
}
