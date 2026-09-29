"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

const COOLDOWN_SECONDS = 30;

/**
 * "Check your inbox" state shown after sign-up (and when an unverified address tries to sign
 * in). `devOutbox` adds a link to the local outbox page, where fake-mode mail lands in
 * development.
 */
export function VerifyNotice({
  email,
  callbackURL,
  devOutbox,
  onBack,
}: {
  email: string;
  callbackURL: string;
  devOutbox?: boolean;
  onBack?: () => void;
}) {
  const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    setSending(true);
    setError(null);
    setMessage(null);
    const { error: failure } = await authClient.sendVerificationEmail({ email, callbackURL });
    setSending(false);
    if (failure) {
      setError(
        failure.status === 429
          ? "Too many tries. Give it a minute and try again."
          : "We couldn't send that. Try again in a moment.",
      );
      return;
    }
    setMessage("Sent again. It can take a minute to arrive.");
    setCooldown(COOLDOWN_SECONDS);
  }

  return (
    <div className="grid gap-4" data-testid="verify-notice">
      <div className="flex items-start gap-3 rounded-lg bg-accent-soft p-3.5">
        <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
        <p className="text-sm text-ink-secondary">
          We sent a confirmation link to <b className="font-semibold text-ink">{email}</b>. Open it
          on this device to finish setting up.
        </p>
      </div>
      <FormAlert>{error}</FormAlert>
      {message ? (
        <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success-ink">
          {message}
        </p>
      ) : null}
      <Button variant="outline" size="lg" onClick={resend} disabled={sending || cooldown > 0}>
        {sending ? "Sending…" : cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend email"}
      </Button>
      {devOutbox ? (
        <p className="rounded-md bg-canvas-sunken px-3 py-2 text-[0.8125rem] text-ink-secondary">
          Development mode: nothing is really sent.{" "}
          <Link
            href="/dev/outbox"
            target="_blank"
            className="font-semibold text-accent hover:underline"
          >
            Open the dev outbox
          </Link>{" "}
          to find the link.
        </p>
      ) : null}
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="text-center text-sm text-ink-muted hover:underline"
        >
          Use a different email
        </button>
      ) : null}
    </div>
  );
}
