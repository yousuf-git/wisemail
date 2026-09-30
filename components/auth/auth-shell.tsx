import Link from "next/link";

import { MotionProvider } from "@/components/app/motion-provider";
import { BrandPanel } from "@/components/auth/brand-panel";
import type { WiziMood } from "@/components/mascot/moods";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Split auth layout shared by sign-in, sign-up, forgot/reset password, email verification,
 * invitations and onboarding: a brand panel (Wizi in a `mood` that fits the page) next to the
 * form. Below `lg` the brand panel becomes a compact header above the form.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
  mood = "idle",
  bubble,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  mood?: WiziMood;
  /** Overrides what Wizi says in the brand panel. */
  bubble?: string;
}) {
  return (
    <MotionProvider>
      <div className="grid flex-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <BrandPanel mood={mood} bubble={bubble} />
        <main className="flex min-w-0 flex-col items-center justify-center gap-6 px-4 py-10 sm:py-14">
          <div className="w-full max-w-[26rem]">
            <div className="mb-6 flex flex-col gap-1.5">
              <h1 className="text-[1.75rem] leading-[2.125rem] font-bold tracking-[-0.02em] text-balance">
                {title}
              </h1>
              <p className="text-ink-muted">{description}</p>
            </div>
            {children}
          </div>

          {footer ? <p className="text-sm text-ink-muted">{footer}</p> : null}
          <p className="max-w-[26rem] text-center text-[0.8125rem] text-ink-muted">
            By continuing you agree to the{" "}
            <Link href="/terms" className="font-medium underline-offset-2 hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
          <ThemeToggle />
        </main>
      </div>
    </MotionProvider>
  );
}

export function FormAlert({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
      {children}
    </p>
  );
}

export function FormNotice({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success-ink">
      {children}
    </p>
  );
}
