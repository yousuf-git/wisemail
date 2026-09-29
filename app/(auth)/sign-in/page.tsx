import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next, expired } = await searchParams;
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to see what your email has been up to."
      footer={
        <Link href="/" className="hover:underline">
          Back to Wisemail
        </Link>
      }
    >
      <SignInForm
        next={typeof next === "string" ? next : undefined}
        expired={expired !== undefined}
      />
    </AuthShell>
  );
}
