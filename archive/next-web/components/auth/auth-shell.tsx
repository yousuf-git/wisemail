import Image from "next/image";
import Link from "next/link";

import { MotionProvider } from "@/components/app/motion-provider";
import { Logo } from "@/components/marketing/logo";
import { Wizi, type WiziMood } from "@/components/mascot/wizi";

/**
 * Centered auth stage — atmosphere + one form island.
 * No split marketing panel; mood still drives Wizi in the corner.
 */
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
  /** Kept for call-site compatibility; bubbles live on Wizi now. */
  bubble?: string;
}) {
  return (
    <MotionProvider>
      <div className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-canvas">
        <Image
          src="/marketing/auth-panel-atmosphere.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="pointer-events-none object-cover opacity-55 dark:opacity-30"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-canvas/80 via-canvas/55 to-canvas"
        />
        <p
          aria-hidden
          className="pointer-events-none absolute top-[18%] left-1/2 hidden w-[min(92vw,56rem)] -translate-x-1/2 text-center font-display text-[clamp(3rem,12vw,8rem)] leading-none font-extrabold tracking-[-0.06em] text-ink/[0.04] select-none lg:block"
        >
          See who opens.
        </p>

        <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8">
          <Logo className="text-base sm:text-lg" />
          <Link
            href="/"
            className="text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            Home
          </Link>
        </header>

        <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-16 sm:px-6">
          <div className="w-full max-w-[24.5rem]">
            <div className="mb-7 grid gap-2 text-center">
              <h1 className="font-display text-[1.75rem] leading-[1.1] font-bold tracking-[-0.035em] text-balance sm:text-[2rem]">
                {title}
              </h1>
              <p className="text-[0.9375rem] leading-6 text-ink-muted">{description}</p>
            </div>

            <div className="rounded-[1.75rem] border border-line/60 bg-surface/90 p-5 shadow-[0_24px_60px_-28px_rgba(60,45,20,0.28)] backdrop-blur-md sm:p-6">
              {children}
            </div>

            <div className="mt-6 grid gap-3 text-center">
              {footer ? <p className="text-sm text-ink-muted">{footer}</p> : null}
              <p className="text-[0.75rem] leading-5 text-ink-faint">
                By continuing you agree to the{" "}
                <Link href="/terms" className="underline-offset-2 hover:text-ink-muted hover:underline">
                  Terms
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  className="underline-offset-2 hover:text-ink-muted hover:underline"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>
        </main>

        <div
          className="pointer-events-none absolute right-4 bottom-3 hidden sm:block lg:right-8 lg:bottom-6"
          aria-hidden
        >
          <div className="pointer-events-auto">
            <Wizi mood={mood} size={72} interactive={false} />
          </div>
        </div>
      </div>
    </MotionProvider>
  );
}

export function FormAlert({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger-ink">
      {children}
    </p>
  );
}

export function FormNotice({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success-ink">
      {children}
    </p>
  );
}
