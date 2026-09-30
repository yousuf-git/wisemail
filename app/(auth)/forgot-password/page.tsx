import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Forgot your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      mood="thinking"
      title="Forgot your password?"
      description="No worries. Tell us your email and we'll send a code and a link to pick a new one."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
