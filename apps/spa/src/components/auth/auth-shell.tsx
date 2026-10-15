import { Link } from "@tanstack/react-router";
import * as m from "motion/react-m";

import { DeskImage, Piece } from "@/components/marketing/desk";
import { Logo } from "@/components/marketing/logo";
import { easeOut, Tone } from "@/components/marketing/section";
import { Wizi, type WiziMood } from "@/components/mascot/wizi";

export const authInputClass =
  "h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-[0.9375rem] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-ink-faint focus:border-accent focus:ring-4 focus:ring-accent/15";

export const authSubmitClass =
  "inline-flex h-12 items-center justify-center rounded-full bg-ink text-[0.9375rem] font-semibold text-canvas transition-[transform,opacity] duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-60";

/**
 * A quiet desk still-life beside the form: Wizi perched on a note he wrote, a paperclip and
 * a few desk objects. It borrows the landing page's materials, not its content.
 */
function DeskPanel({ mood }: { mood: WiziMood }) {
  return (
    <Tone
      tone="light"
      className="relative isolate hidden place-items-center overflow-hidden rounded-[2rem] border border-line bg-[radial-gradient(60%_50%_at_50%_45%,var(--surface),transparent_75%),linear-gradient(180deg,var(--canvas),var(--canvas-sunken))] lg:grid"
    >
      <Piece rotate={8} delay={0.3} from={{ x: 50, y: -40 }} blend className="top-[6%] right-[7%] w-[8.5rem] xl:w-[10rem]">
        <DeskImage name="postage-stamp" />
      </Piece>
      <Piece rotate={10} delay={0.45} from={{ x: -40, y: 60 }} blend className="bottom-[-3.5rem] left-[-2rem] w-[16rem] xl:w-[19rem]">
        <DeskImage name="envelope" />
      </Piece>
      <Piece rotate={-12} delay={0.55} from={{ x: 30, y: 30 }} blend className="right-[10%] bottom-[11%] w-[4.25rem]">
        <DeskImage name="bell-sticker" />
      </Piece>

      <m.div
        className="relative w-[min(23rem,74%)]"
        initial={{ opacity: 0, y: 28, rotate: -7 }}
        animate={{ opacity: 1, y: 0, rotate: -3 }}
        transition={{ duration: 1.1, delay: 0.1, ease: easeOut }}
      >
        <div className="pointer-events-auto absolute right-[2rem] bottom-[calc(100%-2.6rem)] z-10 w-[7.5rem]">
          <Wizi mood={mood} size={200} pose="sit" greet interactive followPointer className="h-auto w-full" />
        </div>
        <div
          className="rounded-[0.5rem] border border-[color:var(--paper-fold)] bg-[color:var(--paper)] px-8 pt-9 pb-8 text-[color:var(--paper-line)] shadow-[0_30px_60px_-28px_rgb(60_45_20_/0.45)]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(180deg, transparent 0 31px, color-mix(in oklab, var(--paper-fold) 55%, transparent) 31px 32px)",
            backgroundPositionY: "30px",
          }}
        >
          <p className="font-display text-[1.375rem] leading-8 font-bold italic">Dear you,</p>
          <p className="mt-0 text-[1.0625rem] leading-8 italic">
            every reply, open and bounce from your Resend accounts is safe with me. I&apos;ll keep
            them right where you can find them.
          </p>
          <p className="mt-0 text-right font-display text-[1.375rem] leading-8 font-bold italic">
            Wizi
          </p>
        </div>
      </m.div>

      <Piece rotate={-24} delay={0.7} from={{ x: -20, y: -30 }} blend className="top-[calc(50%-9.5rem)] left-[calc(50%-11.5rem)] w-[3.5rem]">
        <DeskImage name="paperclip" />
      </Piece>
    </Tone>
  );
}

export function AuthShell({
  title,
  description,
  children,
  footer,
  mood = "idle",
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  mood?: WiziMood;
}) {
  return (
    <Tone
      tone="light"
      className="grid min-h-dvh flex-1 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-3"
    >
      <div className="relative isolate flex min-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden bg-canvas px-3 sm:px-6 lg:px-10">
        {/* Below lg there is no desk panel, so a few desk objects sit around the form. */}
        <Piece rotate={12} delay={0.2} from={{ x: 60, y: -40 }} blend className="top-[3.5rem] right-[-2.5rem] w-[7.5rem] sm:w-[10rem] lg:hidden">
          <DeskImage name="letters" />
        </Piece>
        <Piece rotate={14} delay={0.4} from={{ x: 30, y: 30 }} blend className="right-[8%] bottom-[16%] hidden w-[4rem] sm:block lg:hidden">
          <DeskImage name="at-sticker" />
        </Piece>
        <Piece rotate={-8} delay={0.5} from={{ x: 50, y: 60 }} blend className="right-[-1.75rem] bottom-[-1.75rem] w-[6rem] sm:w-[8rem] lg:hidden">
          <DeskImage name="postage-stamp" />
        </Piece>
        <header className="relative flex items-center justify-between py-4">
          <Logo className="text-base sm:text-lg" />
          <Link
            to="/"
            className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink"
          >
            Back to site
          </Link>
        </header>

        <main className="relative flex flex-1 flex-col justify-center py-10">
          <m.div
            className="mx-auto w-full max-w-[25rem]"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: easeOut }}
          >
            <div className="mb-8 grid gap-3">
              <Wizi mood={mood} size={64} className="-ml-1 lg:hidden" />
              <h1 className="font-display text-[2.25rem] leading-[1.02] font-extrabold tracking-[-0.045em] text-balance sm:text-[2.625rem]">
                {title}
              </h1>
              <p className="text-[0.9375rem] leading-6 text-ink-muted">{description}</p>
            </div>

            {children}

            {footer ? <p className="mt-8 text-sm text-ink-muted">{footer}</p> : null}
          </m.div>
        </main>

        <p className="relative pr-24 pb-2 text-[0.75rem] leading-5 text-ink-faint sm:pr-32 lg:pr-0">
          By continuing you agree to the{" "}
          <Link to="/terms" className="underline-offset-2 hover:text-ink-muted hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="underline-offset-2 hover:text-ink-muted hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      <DeskPanel mood={mood} />
    </Tone>
  );
}

export function FormAlert({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger-ink">
      {children}
    </p>
  );
}

export function FormNotice({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="rounded-xl bg-success-soft px-3.5 py-2.5 text-sm text-success-ink">
      {children}
    </p>
  );
}

/** @deprecated Prefer `AuthShell`. Kept so older pages keep compiling while migrating. */
export function AuthLayout(props: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return <AuthShell {...props} />;
}
