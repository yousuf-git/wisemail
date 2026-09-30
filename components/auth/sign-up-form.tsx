"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormAlert } from "@/components/auth/auth-shell";
import { VerifyNotice } from "@/components/auth/verify-notice";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { safeNext, signUpSchema, type SignUpInput } from "@/lib/validation/auth";

export function SignUpForm({ next, devOutbox }: { next?: string; devOutbox?: boolean }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
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
    setSentTo(values.email);
  }

  if (sentTo) {
    return (
      <VerifyNotice
        email={sentTo}
        callbackURL={safeNext(next)}
        devOutbox={devOutbox}
        onBack={() => setSentTo(null)}
      />
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
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
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormDescription>At least 8 characters.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Creating account…" : "Create account"}
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
