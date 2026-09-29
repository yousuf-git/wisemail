import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Forgot your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgot your password?"
      description="No worries. Tell us your email and we'll send a link to pick a new one."
    >
      <ForgotPasswordForm devOutbox={env.RESEND_MODE === "fake" && env.NODE_ENV !== "production"} />
    </AuthShell>
  );
}
