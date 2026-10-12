import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logomark } from "./logo";
import { Container, Tone } from "./section";

const legal = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

/**
 * Closing colophon — not a link farm.
 * One last line, one action, a quiet credit row.
 */
export function SiteFooter() {
  return (
    <Tone tone="dark" as="footer" className="relative overflow-hidden pt-20 pb-10 sm:pt-28 sm:pb-12">
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 h-px w-[min(720px,80%)] -translate-x-1/2 bg-gradient-to-r from-transparent via-line to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-40 left-1/2 h-80 w-[70vw] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
      />

      <Container className="relative grid gap-16 sm:gap-20">
        <div className="grid max-w-3xl gap-8">
          <p className="font-display text-[clamp(2.5rem,8vw,5.5rem)] leading-[0.92] font-bold tracking-[-0.05em] text-balance">
            Your Resend.
            <span className="mt-1 block text-ink-muted">Wiser from here.</span>
          </p>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button
              asChild
              size="lg"
              className="group h-12 rounded-full px-7 text-base font-semibold sm:h-[3.25rem]"
            >
              <Link href="/sign-up">
                Start free
                <span className="ml-1.5 grid size-8 place-items-center rounded-full bg-accent-ink/15 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                  <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden fill="none">
                    <path
                      d="M3 8h10M9 4l4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </Link>
            </Button>
            <Link
              href="/pricing"
              className="text-sm font-medium text-ink-muted underline-offset-[6px] transition-colors duration-300 hover:text-ink hover:underline"
            >
              See pricing
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-6 border-t border-line/70 pt-8 sm:flex-row sm:items-end sm:justify-between">
          <Link
            href="/"
            aria-label="Wisemail home"
            className="inline-flex items-center gap-2.5 font-display text-sm font-bold tracking-[-0.03em] text-ink-secondary transition-colors hover:text-ink"
          >
            <Logomark className="size-6" />
            Wisemail
          </Link>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-muted">
            <nav aria-label="Legal" className="flex gap-5">
              {legal.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="transition-colors duration-300 hover:text-ink"
                >
                  {l.label}
                </Link>
              ))}
              <Link href="/sign-in" className="transition-colors duration-300 hover:text-ink">
                Sign in
              </Link>
            </nav>
            <span aria-hidden className="hidden text-ink-faint sm:inline">
              ·
            </span>
            <p className="text-ink-faint">
              © {new Date().getFullYear()} · Not affiliated with Resend
            </p>
          </div>
        </div>
      </Container>
    </Tone>
  );
}
