import Link from "next/link";

import { MotionProvider } from "@/components/app/motion-provider";
import { Wizi } from "@/components/mascot/wizi";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <MotionProvider>
      <main className="flex flex-1 flex-col items-center justify-center gap-10 px-4 py-16 text-center">
        <div className="flex w-full max-w-[34rem] flex-col items-center gap-6 rounded-xl bg-surface px-6 py-10 shadow-md sm:px-14 sm:py-12">
          <div className="relative grid place-items-center">
            <span
              aria-hidden
              className="absolute inset-[-10%] rounded-full bg-[radial-gradient(circle,var(--glow-soft),transparent_70%)]"
            />
            <Wizi mood="idle" size={160} greet className="relative" />
          </div>
          <div className="grid gap-2">
            <h1 className="text-4xl leading-10 font-extrabold tracking-[-0.03em]">Wisemail</h1>
            <p className="mx-auto max-w-[34ch] text-lg leading-7 text-balance text-ink-muted">
              Wiser insights and more control over your emails.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-11 rounded-md px-6 font-bold">
              <Link href="/sign-up">Get started</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 rounded-md px-6 font-semibold"
            >
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        </div>
        <ThemeToggle />
      </main>
    </MotionProvider>
  );
}
