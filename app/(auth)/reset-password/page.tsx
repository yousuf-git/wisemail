import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetCodeForm } from "@/components/auth/reset-code-form";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Choose a new password" };

/**
 * Three ways in: `?token=…` (Better Auth's link), `?error=INVALID_TOKEN` (bad or old link), or
 * `?email=…` (from the forgot-password page: enter the emailed 6-digit code).
 */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error, email } = await searchParams;
  const hasToken = typeof token === "string" && token && !error;
  if (!hasToken && !error && typeof email === "string" && z.email().safeParse(email).success) {
    return (
      <AuthShell
        mood="thinking"
        title="Enter your code"
        description="Type the 6-digit code from your email, then pick a new password."
      >
        <ResetCodeForm
          email={email}
          devOutbox={env.RESEND_MODE === "fake" && env.NODE_ENV !== "production"}
        />
      </AuthShell>
    );
  }
  if (!hasToken) {
    return (
      <AuthShell
        mood="worried"
        title="That link doesn't work"
        description="Reset links work once and expire after an hour. Ask for a fresh one and we'll send it right over."
      >
        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">Send a new link or code</Link>
        </Button>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      mood="wow"
      title="Choose a new password"
      description="Pick something you'll remember."
    >
      <ResetPasswordForm token={token as string} />
    </AuthShell>
  );
}
