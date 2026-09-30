"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormAlert } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { SocialButtons } from "@/components/auth/social-buttons";
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
import type { SocialProvider } from "@/lib/auth/social";
import { safeNext, signUpSchema, type SignUpInput } from "@/lib/validation/auth";

export function SignUpForm({
  next,
  providers = [],
}: {
  next?: string;
  providers?: SocialProvider[];
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit(values: SignUpInput) {
    setFormError(null);
    // The confirmation link signs the person in and lands on `callbackURL`.
    const { error } = await authClient.signUp.email({ ...values, callbackURL: safeNext(next) });
    if (error) {
      if (error.status === 429) {
        setFormError("Too many tries. Give it a minute and try again.");
      } else if (error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" || error.status === 422) {
        form.setError("email", { message: "There's already an account with this email." });
      } else {
        setFormError(error.message || "We couldn't create your account. Try again?");
      }
      return;
    }
    // Same screen whether or not the address already had an account (no account enumeration).
    const params = new URLSearchParams({ email: values.email });
    if (next) params.set("next", safeNext(next));
    router.push(`/verify-email?${params}`);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <SocialButtons providers={providers} next={next} disabled={form.formState.isSubmitting} />
        <FormAlert>{formError}</FormAlert>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your name</FormLabel>
              <FormControl>
                <Input autoComplete="name" placeholder="Sam Rivera" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
                <PasswordInput autoComplete="new-password" strength {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting || form.formState.isSubmitSuccessful
            ? "Creating account…"
            : "Create account"}
        </Button>
        <p className="text-center text-sm text-ink-muted">
          Already have an account?{" "}
          <Link
            href={next ? `/sign-in?next=${encodeURIComponent(safeNext(next))}` : "/sign-in"}
            className="font-medium text-accent-fill hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </Form>
  );
}
