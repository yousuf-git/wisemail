import { Link } from "@tanstack/react-router";
import { useEffect } from "react";

import { Wizi } from "@/components/mascot/wizi";
import { cn } from "@/lib/utils";

/**
 * Friendly last-resort screen. Never shows the raw error message (it may hold data).
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
    console.error("[error-view]", error);
  }, [error]);

  return (
    <div
      role="alert"
      data-testid="error-view"
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-5 px-4 py-16 text-center",
        className,
      )}
    >
      <Wizi mood="worried" size={160} />
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
        <button
          type="button"
          onClick={() => retry()}
          className="h-11 rounded-md bg-accent-fill px-6 text-sm font-bold text-accent-ink hover:bg-accent-fill-hover"
        >
          Try again
        </button>
        {/* Plain link: the router itself may be what failed. */}
        <a
          href={homeHref}
          className="inline-flex h-11 items-center rounded-md border border-line px-6 text-sm font-semibold hover:bg-canvas"
        >
          {homeLabel}
        </a>
        {homeHref !== "/" ? (
          <Link to="/" className="sr-only">
            Home
          </Link>
        ) : null}
      </div>
    </div>
  );
}
