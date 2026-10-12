import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logomark } from "./logo";
import { HeroJourney } from "./hero-journey";
import { Reveal } from "./reveal";
import { Container, Tone } from "./section";

/**
 * Poster hero: brand first, one idea, one live product moment.
 * Not a left-copy / right-dashboard layout.
 */
export function Hero() {
  return (
    <Tone
      tone="light"
      as="section"
      className="relative flex min-h-[100dvh] flex-col overflow-x-clip pt-6 pb-10 sm:pt-8 sm:pb-14"
    >
      <Image
        src="/marketing/hero-atmosphere.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="pointer-events-none object-cover object-[center_20%] opacity-90"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-canvas/55 via-canvas/25 to-canvas"
      />

      <Container className="relative flex flex-1 flex-col justify-between gap-16 pt-8 sm:gap-20 sm:pt-10 lg:gap-24">
        <div className="grid max-w-5xl gap-10 sm:gap-12">
          <Reveal y={18}>
            <p className="inline-flex items-center gap-3 font-display text-2xl font-bold tracking-[-0.04em] text-ink sm:text-3xl">
              <Logomark className="size-9 sm:size-10" />
              Wisemail
            </p>
          </Reveal>

          <div className="grid gap-8">
            <Reveal delay={0.08} y={28}>
              <h1 className="max-w-[12ch] font-display text-[clamp(3.25rem,11vw,7.5rem)] leading-[0.88] font-bold tracking-[-0.055em] text-balance">
                See who
                <span className="block">opens.</span>
              </h1>
            </Reveal>

            <Reveal delay={0.16} y={20}>
              <p className="max-w-[32ch] text-lg leading-8 text-pretty text-ink-secondary sm:text-xl sm:leading-9">
                Marketing that talks back — opens, clicks and alerts on your own Resend account.
              </p>
            </Reveal>

            <Reveal delay={0.22} y={16}>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <Button
                  asChild
                  size="lg"
                  className="group h-12 rounded-full px-7 text-base font-semibold sm:h-[3.25rem]"
                >
                  <Link href="/sign-up">
                    Start free
                    <span className="ml-1.5 grid size-8 place-items-center rounded-full bg-accent-ink/15 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-active:scale-[0.98]">
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
                  href="/#how"
                  className="text-sm font-medium text-ink-muted underline-offset-[6px] transition-colors duration-300 hover:text-ink hover:underline"
                >
                  How it works
                </Link>
              </div>
            </Reveal>
          </div>
        </div>

        <Reveal delay={0.28} y={36} className="mt-auto w-full max-w-4xl">
          <HeroJourney />
        </Reveal>
      </Container>
    </Tone>
  );
}
