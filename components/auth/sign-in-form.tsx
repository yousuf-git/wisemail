"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormAlert } from "@/components/auth/auth-shell";
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
export function SignInForm({ next, expired }: { next?: string; expired?: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(
    expired ? "Your session ended. Sign in again to keep going." : null,
  );
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInInput) {
    setFormError(null);
    const { error } = await authClient.signIn.email(values);
    if (error) {
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
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
              <FormLabel>Password</FormLabel>
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
            className="font-medium text-accent hover:underline"
          >
            Create an account
          </Link>
        </p>
      </form>
    </Form>
  );
}
