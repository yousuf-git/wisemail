"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { MotionProvider } from "@/components/app/motion-provider";
import { Wizi } from "@/components/mascot/wizi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Friendly last-resort screen (Wisemail voice, Wizi worried). Reports the error to Sentry (a no-op
 * without a DSN) and shows only the digest as a reference, never the message (it may hold data).
 */
export function ErrorView({
  error,
  retry,
  homeHref = "/",
  homeLabel = "Back to Wisemail",
  className,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  homeHref?: string;
  homeLabel?: string;
  className?: string;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <MotionProvider>
      <div
        role="alert"
        data-testid="error-view"
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-5 px-4 py-16 text-center",
          className,
        )}
      >
        <Wizi mood="worried" size={160} interactive={false} />
        <div className="grid max-w-[44ch] gap-2">
          <h1 className="text-2xl leading-8 font-bold tracking-[-0.02em] text-balance">
            Oops, something tripped Wizi up
          </h1>
          <p className="text-ink-muted">
            That was on our side, not yours, and nothing you did is lost. Give it another go, and if
            it keeps happening, tell us and we will look into it.
          </p>
          {error.digest ? (
            <p className="font-mono text-xs text-ink-muted">Reference: {error.digest}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" className="h-11 rounded-md px-6 font-bold" onClick={() => retry()}>
            Try again
          </Button>
          <Button asChild variant="outline" size="lg" className="h-11 rounded-md px-6">
            {/* A plain link: the router itself may be what failed. */}
            <a href={homeHref}>{homeLabel}</a>
          </Button>
        </div>
      </div>
    </MotionProvider>
  );
}
