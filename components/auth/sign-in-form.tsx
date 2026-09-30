"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormAlert } from "@/components/auth/auth-shell";
import { VerifyNotice } from "@/components/auth/verify-notice";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { safeNext, signInSchema, type SignInInput } from "@/lib/validation/auth";

/**
 * Uses the Better Auth client (POST /api/auth/sign-in/email) rather than a server action:
 * requests go through the HTTP handler, so Better Auth's endpoint rate limiting applies
 * (calls to `auth.api.*` from a server action bypass it).
 */
export function SignInForm({
  next,
  expired,
  passwordReset,
  devOutbox,
}: {
  next?: string;
  expired?: boolean;
  passwordReset?: boolean;
  devOutbox?: boolean;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(
    expired ? "Your session ended. Sign in again to keep going." : null,
  );
  const [unverified, setUnverified] = useState<string | null>(null);
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInInput) {
    setFormError(null);
    // If the address isn't confirmed yet, Better Auth emails a fresh link that lands on `next`.
    const { error } = await authClient.signIn.email({ ...values, callbackURL: safeNext(next) });
    if (error) {
      if (error.status === 403 || error.code === "EMAIL_NOT_VERIFIED") {
        setUnverified(values.email);
        return;
      }
      setFormError(
        error.status === 429
          ? "Too many tries. Give it a minute and try again."
          : "That email and password don't match. Try again?",
      );
      return;
    }
    router.replace(safeNext(next));
    router.refresh();
  }

  if (unverified) {
    return (
      <div className="grid gap-4">
        <FormAlert>Confirm your email before signing in. We just sent you a new link.</FormAlert>
        <VerifyNotice
          email={unverified}
          callbackURL={safeNext(next)}
          devOutbox={devOutbox}
          onBack={() => setUnverified(null)}
        />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        {passwordReset ? (
          <p
            role="status"
            className="rounded-md bg-success-soft px-3 py-2 text-sm text-success-ink"
          >
            Password updated. Sign in with the new one.
          </p>
        ) : null}
        <FormAlert>{formError}</FormAlert>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="you@company.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-baseline justify-between gap-2">
                <FormLabel>Password</FormLabel>
                <Link
                  href="/forgot-password"
                  className="text-[0.8125rem] font-medium text-accent-fill hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center text-sm text-ink-muted">
          New here?{" "}
          <Link
            href={next ? `/sign-up?next=${encodeURIComponent(safeNext(next))}` : "/sign-up"}
            className="font-medium text-accent-fill hover:underline"
          >
            Create an account
          </Link>
        </p>
      </form>
    </Form>
  );
}
