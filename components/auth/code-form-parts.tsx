"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { OTP_EXPIRES_IN, RESEND_COOLDOWN_SECONDS } from "@/lib/auth/otp-config";

/** Counts down once a second from `start`; `reset` starts over. Stops at 0. */
export function useCountdown(start: number) {
  const [left, setLeft] = useState(start);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  return [left, (seconds: number = start) => setLeft(seconds)] as const;
}

/** Resend cooldown and code expiry clocks, restarted together when a new email goes out. */
export function useCodeClocks() {
  const [cooldown, setCooldown] = useCountdown(RESEND_COOLDOWN_SECONDS);
  const [expiresIn, setExpiresIn] = useCountdown(OTP_EXPIRES_IN);
  return {
    cooldown,
    expiresIn,
    restart: () => {
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setExpiresIn(OTP_EXPIRES_IN);
    },
    allowResendNow: () => setCooldown(0),
    markExpired: () => setExpiresIn(0),
  };
}

export function ExpiryText({ seconds }: { seconds: number }) {
  if (seconds <= 0) {
    return <span className="text-danger-ink">That code expired. Send a new one below.</span>;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return (
    <>
      The code works for {Math.ceil(OTP_EXPIRES_IN / 60)} minutes. Expires in{" "}
      <span className="font-mono tabular-nums">
        {minutes}:{rest}
      </span>
      .
    </>
  );
}

export function DevOutboxHint({ what = "code" }: { what?: string }) {
  return (
    <p className="rounded-md bg-canvas-sunken px-3 py-2 text-[0.8125rem] text-ink-secondary">
      Development mode: nothing is really sent.{" "}
      <Link
        href="/dev/outbox"
        target="_blank"
        className="font-semibold text-accent-fill hover:underline"
      >
        Open the dev outbox
      </Link>{" "}
      to find the {what}.
    </p>
  );
}

/** Maps a Better Auth OTP error to Wisemail copy. */
export function otpErrorMessage(error: { status?: number; code?: string }): {
  message: string;
  needsNewCode: boolean;
} {
  if (error.status === 429) {
    return { message: "Too many tries. Give it a minute and try again.", needsNewCode: false };
  }
  if (error.code === "OTP_EXPIRED") {
    return { message: "That code expired. Send a new one and try again.", needsNewCode: true };
  }
  if (error.code === "TOO_MANY_ATTEMPTS") {
    return {
      message: "That's too many wrong tries for this code. Send a new one to keep going.",
      needsNewCode: true,
    };
  }
  return { message: "That code doesn't match. Check it and try again.", needsNewCode: false };
}
