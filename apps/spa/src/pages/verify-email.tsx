import { Link, Navigate, useSearch } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { AuthShell, FormAlert, FormNotice, authSubmitClass } from "@/components/auth/auth-shell";
import { OtpInput } from "@/components/auth/otp-input";
import { authClient } from "@/lib/auth/client";
import { safeNext } from "@/lib/auth/safe-next";

const OTP_LENGTH = 6;

export function VerifyEmailPage() {
  const search = useSearch({ from: "/verify-email" });
  const emailRaw = typeof search.email === "string" ? search.email : "";
  const next = typeof search.next === "string" ? search.next : undefined;
  const parsed = z.email().safeParse(emailRaw);
  const session = authClient.useSession();

  const [code, setCode] = useState("");
  const [boxes, setBoxes] = useState(0);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (session.data?.user?.emailVerified) {
    return <Navigate to={safeNext(next, "/")} />;
  }

  if (!parsed.success) {
    return <Navigate to="/sign-up" />;
  }

  const email = parsed.data;
  const callbackURL = safeNext(next, "/");

  async function verify(otp: string) {
    if (otp.length !== OTP_LENGTH || checking) return;
    setChecking(true);
    setError(null);
    setMessage(null);
    const { error: failure } = await authClient.emailOtp.verifyEmail({ email, otp });
    setChecking(false);
    if (failure) {
      setError(
        failure.status === 429
          ? "Too many tries. Give it a minute and try again."
          : failure.code === "OTP_EXPIRED"
            ? "That code expired. Ask for a new one."
            : "That code didn't work. Try again?",
      );
      setCode("");
      setBoxes((n) => n + 1);
      return;
    }
    window.location.assign(callbackURL);
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
  }

  return (
    <AuthShell
      title="Check your inbox"
      description="One quick step to make sure this address is really yours."
      mood="thinking"
      footer={
        <Link
          to="/sign-up"
          search={next ? { next } : undefined}
          className="font-medium text-accent-fill hover:underline"
        >
          Use a different email
        </Link>
      }
    >
      <div className="grid gap-5" data-testid="verify-notice">
        <div className="flex items-start gap-3 rounded-lg bg-accent-soft p-3.5">
          <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-fill" />
          <p className="text-sm text-ink-secondary">
            We sent a 6-digit code and a confirmation link to{" "}
            <b className="font-semibold break-all text-ink">{email}</b>. Enter the code here, or
            open the link.
          </p>
        </div>
        <FormAlert>{error}</FormAlert>
        <FormNotice>{message}</FormNotice>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void verify(code.trim());
          }}
        >
          <div className="grid gap-2">
            <p className="text-sm font-medium">Code</p>
            <OtpInput
              key={boxes}
              value={code}
              onChange={setCode}
              onComplete={(otp) => void verify(otp)}
              length={OTP_LENGTH}
              disabled={checking}
              invalid={!!error}
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={checking || code.length !== OTP_LENGTH}
            className={authSubmitClass}
          >
            {checking ? "Checking…" : "Confirm"}
          </button>
        </form>
        <button
          type="button"
          disabled={sending}
          onClick={() => void resend()}
          className="justify-self-start text-sm font-medium text-accent-fill hover:underline disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send a new code"}
        </button>
      </div>
    </AuthShell>
  );
}
