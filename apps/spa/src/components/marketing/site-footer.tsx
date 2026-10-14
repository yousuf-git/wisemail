import { Link } from "@tanstack/react-router";

import { Logomark } from "./logo";
import { Container, Tone } from "./section";

const legal = [
  { to: "/privacy" as const, label: "Privacy" },
  { to: "/terms" as const, label: "Terms" },
];

export function SiteFooter() {
  return (
    <Tone tone="dark" as="footer" className="relative overflow-hidden pt-20 pb-10 sm:pt-28 sm:pb-12">
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 h-px w-[min(720px,80%)] -translate-x-1/2 bg-gradient-to-r from-transparent via-line to-transparent"
      />
      <Container className="relative grid gap-16 sm:gap-20">
        <div className="grid max-w-3xl gap-8">
          <p className="font-display text-[clamp(2.5rem,8vw,5.5rem)] leading-[0.92] font-bold tracking-[-0.05em] text-balance">
            Your Resend.
            <span className="mt-1 block text-ink-muted">Wiser from here.</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              to="/sign-up"
              className="inline-flex h-12 items-center rounded-full bg-accent-fill px-7 text-base font-semibold text-accent-ink hover:bg-accent-fill-hover"
            >
              Start free
            </Link>
            <Link
              to="/pricing"
              className="text-sm font-medium text-ink-muted underline-offset-[6px] hover:text-ink hover:underline"
            >
              See pricing
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-6 border-t border-line/70 pt-8 sm:flex-row sm:items-end sm:justify-between">
          <Link
            to="/"
            aria-label="Wisemail home"
            className="inline-flex items-center gap-2.5 font-display text-sm font-bold tracking-[-0.03em] text-ink-secondary hover:text-ink"
          >
            <Logomark className="size-6" />
            Wisemail
          </Link>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-muted">
            <nav aria-label="Legal" className="flex gap-5">
              {legal.map((l) => (
                <Link key={l.to} to={l.to} className="hover:text-ink">
                  {l.label}
                </Link>
              ))}
            </nav>
            <span>© {new Date().getFullYear()} Wisemail</span>
          </div>
        </div>
      </Container>
    </Tone>
  );
}
