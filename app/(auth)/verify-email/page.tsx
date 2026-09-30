import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyNotice } from "@/components/auth/verify-notice";
import { getSession } from "@/lib/dal";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/validation/auth";

export const metadata: Metadata = { title: "Confirm your email" };

/** Code entry after sign-up (or an unverified sign-in): `?email=…&next=…`. */
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { email, next } = await searchParams;
  const nextPath = safeNext(typeof next === "string" ? next : undefined);

  const session = await getSession();
  if (session?.user.emailVerified) redirect(nextPath);

  const parsed = z.email().safeParse(typeof email === "string" ? email : "");
  if (!parsed.success) redirect("/sign-up");

  return (
    <AuthShell
      mood="detective"
      title="Check your inbox"
      description="One quick step to make sure this address is really yours."
    >
      <VerifyNotice
        email={parsed.data}
        callbackURL={nextPath}
        devOutbox={env.RESEND_MODE === "fake" && env.NODE_ENV !== "production"}
        backHref={next ? `/sign-up?next=${encodeURIComponent(nextPath)}` : "/sign-up"}
      />
    </AuthShell>
  );
}
