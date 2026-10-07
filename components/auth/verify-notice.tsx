"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormAlert, FormNotice } from "@/components/auth/auth-shell";
import {
  DevOutboxHint,
  ExpiryText,
  otpErrorMessage,
  useCodeClocks,
} from "@/components/auth/code-form-parts";
import { OtpInput } from "@/components/auth/otp-input";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { OTP_LENGTH } from "@/lib/auth/otp-config";

/**
 * "Check your inbox" screen after sign-up, when an unverified address signs in, and on an
 * invitation page. The email carries a link and a 6-digit code; either confirms the address.
 * Entering the code signs the person in (Better Auth `autoSignInAfterVerification`) and continues
 * to `callbackURL`. `devOutbox` adds a pointer to the local outbox, where fake-mode mail lands.
 */
export function VerifyNotice({
  email,
  callbackURL,
  devOutbox,
  backHref,
}: {
  email: string;
  callbackURL: string;
  devOutbox?: boolean;
  /** Where "Use a different email" goes. Omit to hide it. */
  backHref?: string;
}) {
  const router = useRouter();
  const clocks = useCodeClocks();
  const [code, setCode] = useState("");
  const [boxes, setBoxes] = useState(0);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verify(otp: string) {
    if (otp.length !== OTP_LENGTH || checking) return;
    setChecking(true);
    setError(null);
    setMessage(null);
    const { error: failure } = await authClient.emailOtp.verifyEmail({ email, otp });
    if (failure) {
      const { message: copy, needsNewCode } = otpErrorMessage(failure);
      setError(copy);
      if (needsNewCode) clocks.allowResendNow();
      if (failure.code === "OTP_EXPIRED") clocks.markExpired();
      setCode("");
      setBoxes((n) => n + 1);
      setChecking(false);
      return;
    }
    router.replace(callbackURL);
    router.refresh();
  }

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
    setMessage("Sent again. The new code replaces the old one.");
    setCode("");
    setBoxes((n) => n + 1);
    clocks.restart();
  }

  return (
    <div className="grid gap-5" data-testid="verify-notice">
      <div className="flex items-start gap-3 rounded-lg bg-accent-soft p-3.5">
        <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-fill" />
        <p className="text-sm text-ink-secondary">
          We sent a 6-digit code and a confirmation link to{" "}
          <b className="font-semibold break-all text-ink">{email}</b>. Enter the code here, or open
          the link.
        </p>
      </div>

      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void verify(code);
        }}
      >
        <FormAlert>{error}</FormAlert>
        <FormNotice>{message}</FormNotice>
        <OtpInput
          key={boxes}
          idPrefix="verify-otp"
          label="6-digit confirmation code"
          value={code}
          onChange={setCode}
          onComplete={(full) => void verify(full)}
          disabled={checking}
          invalid={!!error}
          autoFocus
        />
        <p className="text-[0.8125rem] text-ink-muted" data-testid="otp-expiry">
          <ExpiryText seconds={clocks.expiresIn} />
        </p>
        <Button
          type="submit"
          size="lg"
          className="h-11 rounded-full font-semibold"
          disabled={checking || code.length !== OTP_LENGTH}
        >
          {checking ? "Checking…" : "Confirm email"}
        </Button>
      </form>

      <Button
        variant="outline"
        size="lg"
        className="h-11 rounded-full font-medium"
        onClick={resend}
        disabled={sending || clocks.cooldown > 0}
      >
        {sending
          ? "Sending…"
          : clocks.cooldown > 0
            ? `Resend email in ${clocks.cooldown}s`
            : "Resend email"}
      </Button>
      {devOutbox ? <DevOutboxHint /> : null}
      {backHref ? (
        <Link href={backHref} className="text-center text-sm text-ink-muted hover:underline">
          Use a different email
        </Link>
      ) : null}
    </div>
  );
}
