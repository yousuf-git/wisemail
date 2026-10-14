import { Link } from "@tanstack/react-router";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useSyncExternalStore } from "react";

import { Wizi } from "@/components/mascot/wizi";
import { AtmosphereWaves } from "./atmosphere-waves";
import { HeroStamp, useHeroJourney } from "./hero-receipts";
import { Tone } from "./section";

function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia("(min-width: 768px)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const getWide = () => window.matchMedia("(min-width: 768px)").matches;
const getWideServer = () => false;

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Desk theater — Wizi sits on the product surface.
 * Brand is the title card. One line, one sentence, one CTA.
 * Deliberately not a left-column SaaS hero.
 */
export function Hero() {
  const { mood, caption, active } = useHeroJourney();
  const wide = useSyncExternalStore(subscribeWide, getWide, getWideServer);
  const reduce = useReducedMotion();

  const enter = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.65, delay, ease },
        };

  return (
    <Tone
      tone="light"
      as="section"
      className="relative isolate flex min-h-[100dvh] flex-col overflow-x-clip"
    >
      <AtmosphereWaves variant="hero" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_40%_at_50%_22%,color-mix(in_oklab,var(--glow)_12%,transparent),transparent_68%)]"
      />

      {/* Upper stage — character dominates */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-end px-5 pt-4 sm:px-8 sm:pt-6">
        <m.div
          className="relative z-20"
          {...(reduce
            ? {}
            : {
                initial: { opacity: 0, y: 36, scale: 0.92 },
                animate: { opacity: 1, y: 0, scale: 1 },
                transition: { duration: 0.9, ease },
              })}
        >
          <Wizi
            mood={mood}
            size={wide ? 260 : 176}
            title="Wizi"
            greet
            interactive
            className="relative z-10 drop-shadow-[0_32px_56px_rgb(60_45_20_/0.2)]"
          />
          <HeroStamp
            caption={caption}
            active={active}
            className="absolute top-[62%] left-[72%] z-20 sm:top-[54%] sm:left-[78%] md:left-[82%]"
          />
        </m.div>
      </div>

      {/* Desk surface — title card lives here */}
      <div className="relative z-10 border-t border-[color:var(--paper-fold)]/50 bg-[color:var(--paper)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-b from-transparent to-[color:var(--paper)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-3 left-1/2 h-6 w-[min(70%,20rem)] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center,rgb(60_45_20_/0.16),transparent_72%)] blur-[2px]"
        />

        <div className="relative mx-auto flex w-full max-w-[32rem] flex-col items-center px-5 pt-10 pb-11 text-center sm:px-8 sm:pt-12 sm:pb-14">
          <m.h1
            className="font-display text-[clamp(2.75rem,9vw,4.5rem)] leading-none font-extrabold tracking-[-0.06em] text-[color:var(--paper-line)]"
            {...enter(0.15)}
          >
            Wisemail
          </m.h1>

          <m.p
            className="mt-4 font-display text-[clamp(1.2rem,3.2vw,1.65rem)] leading-snug font-bold tracking-[-0.03em] text-ink-secondary"
            {...enter(0.25)}
          >
            All your Resend. One desk.
          </m.p>

          <m.p
            className="mt-3 max-w-[22rem] text-[0.9375rem] leading-6 text-pretty text-ink-muted sm:text-base sm:leading-7"
            {...enter(0.35)}
          >
            Inbox, receipts, insights, and alerts across every account you connect.
          </m.p>

          <m.div className="mt-7 sm:mt-8" {...enter(0.45)}>
            <Link
              to="/sign-up"
              className="inline-flex h-12 items-center rounded-full bg-accent-fill px-8 text-base font-semibold text-accent-ink shadow-[0_14px_32px_-12px_color-mix(in_oklab,var(--accent-fill)_60%,transparent)] transition-[transform,background-color,box-shadow] hover:bg-accent-fill-hover hover:shadow-[0_16px_36px_-12px_color-mix(in_oklab,var(--accent-fill)_70%,transparent)] active:translate-y-px"
            >
              Start free
            </Link>
          </m.div>
        </div>
      </div>
    </Tone>
  );
}
