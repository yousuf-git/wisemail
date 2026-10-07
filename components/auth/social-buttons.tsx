"use client";

import { useState } from "react";

import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import type { SocialProvider } from "@/lib/auth/social";
import { safeNext } from "@/lib/validation/auth";

const LABELS: Record<SocialProvider, string> = { google: "Google", github: "GitHub" };

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.24 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

/**
 * "Continue with Google / GitHub". Renders nothing unless the server enabled a provider, so the
 * sign-in and sign-up forms stay clean when no OAuth app is configured. The provider verifies
 * the email, so a new person skips the confirmation step and lands on `next` (onboarding).
 */
export function SocialButtons({
  providers,
  next,
  disabled,
}: {
  providers: SocialProvider[];
  next?: string;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (providers.length === 0) return null;

  async function go(provider: SocialProvider) {
    setError(null);
    setPending(provider);
    const callbackURL = safeNext(next);
    const { error: failure } = await authClient.signIn.social({
      provider,
      callbackURL,
      errorCallbackURL: "/sign-in",
    });
    // On success the browser is already leaving for the provider.
    if (failure) {
      setPending(null);
      setError(`We couldn't reach ${LABELS[provider]}. Try again in a moment.`);
    }
  }

  return (
    <div className="grid gap-3" data-testid="social-buttons">
      <FormAlert>{error}</FormAlert>
      <div className={providers.length > 1 ? "grid gap-2 sm:grid-cols-2" : "grid gap-2"}>
        {providers.map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="outline"
            size="lg"
            className="h-11 rounded-full font-medium"
            disabled={disabled || pending !== null}
            onClick={() => go(provider)}
          >
            {provider === "google" ? <GoogleMark /> : <GitHubMark />}
            {pending === provider ? "Opening…" : `Continue with ${LABELS[provider]}`}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[0.8125rem] text-ink-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        or use your email
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
