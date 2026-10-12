import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { enabledSocialProviders } from "@/lib/auth/social";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const { next } = await searchParams;
  return (
    <AuthShell
      mood="happy"
      title="Create your account"
      description="A minute to start. Free plan, no card."
    >
      <SignUpForm
        next={typeof next === "string" ? next : undefined}
        providers={enabledSocialProviders()}
      />
    </AuthShell>
  );
}
