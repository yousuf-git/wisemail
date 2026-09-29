import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Choose a new password" };

/** Better Auth redirects here as `?token=…`, or `?error=INVALID_TOKEN` for a bad or old link. */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error } = await searchParams;
  if (typeof token !== "string" || !token || error) {
    return (
      <AuthShell
        title="That link doesn't work"
        description="Reset links work once and expire after an hour. Ask for a fresh one and we'll send it right over."
      >
        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">Send a new link</Link>
        </Button>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" description="Pick something you'll remember.">
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
