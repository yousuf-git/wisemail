import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const { next } = await searchParams;
  return (
    <AuthShell
      title="Let's get you set up"
      description="Create your Wisemail account. It only takes a minute."
    >
      <SignUpForm
        next={typeof next === "string" ? next : undefined}
        devOutbox={env.RESEND_MODE === "fake" && env.NODE_ENV !== "production"}
      />
    </AuthShell>
  );
}
