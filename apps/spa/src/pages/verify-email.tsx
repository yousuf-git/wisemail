import { Link, Navigate, useSearch } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { authClient } from "@/lib/auth/client";
import { safeNext } from "@/lib/auth/safe-next";
import { AuthLayout } from "@/pages/sign-up";

const OTP_LENGTH = 6;

export function VerifyEmailPage() {
  const search = useSearch({ from: "/verify-email" });
  const emailRaw = typeof search.email === "string" ? search.email : "";
  const next = typeof search.next === "string" ? search.next : undefined;
  const parsed = z.email().safeParse(emailRaw);
  const session = authClient.useSession();

  const [code, setCode] = useState("");
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
  }

  return (
    <AuthLayout
      title="Check your inbox"
      description="One quick step to make sure this address is really yours."
      footer={
        <p className="text-center text-sm text-ink-muted">
          <Link
            to="/sign-up"
            search={next ? { next } : undefined}
            className="font-medium text-accent-fill hover:underline"
          >
            Use a different email
          </Link>
        </p>
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
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-md bg-success-soft px-3 py-2 text-sm text-success-ink">{message}</p>
        ) : null}
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void verify(code.trim());
          }}
        >
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Code</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={OTP_LENGTH}
              value={code}
              onChange={(e) => {
                const nextCode = e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH);
                setCode(nextCode);
                if (nextCode.length === OTP_LENGTH) void verify(nextCode);
              }}
              className="h-10 rounded-control border border-line-strong bg-canvas px-3 font-mono tracking-[0.3em] outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <button
            type="submit"
            disabled={checking || code.length !== OTP_LENGTH}
            className="h-10 rounded-control bg-accent-fill text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-60"
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
    </AuthLayout>
  );
}
