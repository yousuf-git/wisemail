import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useScroll } from "motion/react";
import * as m from "motion/react-m";
import { useRef } from "react";

import { Wizi } from "@/components/mascot/wizi";
import {
  DeskImage,
  glossyButtonClass,
  InboxCard,
  NotificationStack,
  OpenRateCard,
  Piece,
  ReceiptCard,
} from "./desk";
import { easeOut, Tone } from "./section";

export function Hero() {
  const ref = useRef<HTMLSpanElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end start"] });

  return (
    <Tone
      tone="light"
      as="section"
      className="relative isolate -mt-[4.5rem] flex min-h-[100dvh] flex-col overflow-hidden pt-[4.5rem] sm:-mt-[4.75rem] sm:pt-[4.75rem]"
    >
      <span ref={ref} className="absolute inset-0 -z-20" aria-hidden />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(48%_42%_at_50%_45%,var(--surface),transparent_75%),linear-gradient(180deg,var(--canvas),var(--canvas-sunken))]"
      />

      {/* Left edge */}
      <Piece progress={p} depth={0.25} rotate={-5} delay={0.35} from={{ x: -120, y: 0 }} className="top-[38%] left-[-5rem] hidden w-[19rem] lg:block xl:left-[-2rem]">
        <InboxCard wizi="idle" />
      </Piece>
      <Piece progress={p} depth={0.7} rotate={9} delay={0.5} from={{ x: -60, y: 60 }} blend className="bottom-[-3rem] left-[6%] hidden w-[16rem] md:block lg:w-[20rem]">
        <DeskImage name="envelope" />
      </Piece>
      <Piece progress={p} depth={0.35} rotate={-3} delay={0.6} from={{ x: -40, y: 80 }} className="bottom-[8%] left-[-1.5rem] hidden w-[15rem] lg:block xl:left-[3%]">
        <OpenRateCard />
      </Piece>
      <Piece progress={p} depth={0.8} rotate={-32} delay={0.7} from={{ x: -30, y: -30 }} blend className="top-[34%] left-[25%] hidden w-[4.25rem] lg:block xl:left-[28%]">
        <DeskImage name="paperclip" />
      </Piece>

      {/* Right edge */}
      <Piece progress={p} depth={0.55} rotate={12} delay={0.25} from={{ x: 80, y: -40 }} blend className="top-[9%] right-[-2.5rem] w-[8rem] sm:top-[7%] sm:right-[-3rem] sm:w-[12rem] lg:right-[0%] lg:w-[15rem]">
        <DeskImage name="letters" />
      </Piece>
      <Piece progress={p} depth={0.9} rotate={-10} delay={0.45} from={{ x: 60, y: 0 }} blend className="top-[12%] left-[5%] w-[3.75rem] sm:w-[4.5rem] md:top-[34%] md:left-[auto] md:right-[7%] lg:top-[30%] lg:right-[17%] lg:w-[5.5rem]">
        <DeskImage name="bell-sticker" />
      </Piece>
      <Piece progress={p} depth={0.3} rotate={4} delay={0.4} from={{ x: 120, y: 20 }} className="top-[40%] right-[-4rem] hidden w-[18rem] lg:block xl:right-[-1rem]">
        <ReceiptCard />
      </Piece>
      <Piece progress={p} depth={1.1} rotate={14} delay={0.55} from={{ x: 40, y: 40 }} blend className="bottom-[14%] left-[6%] w-[3.25rem] sm:w-[4rem] md:left-[auto] md:right-[13%] md:bottom-[22%] lg:w-[4.75rem]">
        <DeskImage name="at-sticker" />
      </Piece>
      <Piece progress={p} depth={0.6} rotate={-8} delay={0.65} from={{ x: 60, y: 80 }} blend className="right-[-1.5rem] bottom-[-1rem] w-[7rem] sm:right-[2%] sm:w-[9rem] lg:w-[13rem]">
        <DeskImage name="postage-stamp" />
      </Piece>

      {/* Center */}
      <div className="relative z-10 mx-auto flex w-full max-w-[46rem] flex-1 flex-col items-center justify-center px-5 pt-8 pb-20 text-center sm:pt-10 sm:pb-32 lg:pb-40">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: easeOut }}
        >
          <NotificationStack />
        </m.div>

        <m.h1
          className="mt-6 font-display text-[clamp(2.6rem,6.8vw,5.75rem)] leading-[0.95] font-extrabold tracking-[-0.055em] text-balance"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.1, ease: easeOut }}
        >
          Every email,
          <br /> accounted for.
        </m.h1>

        <m.p
          className="mt-5 max-w-[27rem] text-base leading-7 text-pretty text-ink-secondary sm:text-lg"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2, ease: easeOut }}
        >
          The inbox, read receipts and alerts your Resend account never came with.
        </m.p>

        <m.div
          className="mt-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3, ease: easeOut }}
        >
          <Link to="/sign-up" className={glossyButtonClass}>
            Start free
            <ArrowRight
              className="size-[1.125rem] transition-transform duration-300 group-hover:translate-x-0.5"
              strokeWidth={2.5}
              aria-hidden
            />
          </Link>
        </m.div>

        {/* Below lg the inbox card is hidden, so Wizi stands under the CTA instead. */}
        <m.div
          className="mt-8 lg:hidden"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 90, damping: 14, delay: 0.55 }}
        >
          <Wizi mood="idle" size={112} greet interactive followPointer />
        </m.div>
      </div>
    </Tone>
  );
}
