import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthShell, FormAlert, authInputClass, authSubmitClass } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { SocialButtons } from "@/components/auth/social-buttons";
import { authClient } from "@/lib/auth/client";
import { safeNext } from "@/lib/auth/safe-next";

const signInSchema = z.object({
  email: z.email("That email doesn't look right."),
  password: z.string().min(1, "Enter your password."),
});
type SignInInput = z.infer<typeof signInSchema>;

export function SignInPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/sign-in" });
  const next = typeof search.next === "string" ? search.next : undefined;
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInInput) {
    setFormError(null);
    const { error } = await authClient.signIn.email({
      ...values,
      callbackURL: safeNext(next, "/"),
    });
    if (error) {
      setFormError(
        error.status === 429
          ? "Too many tries. Give it a minute and try again."
          : "That email and password don't match. Try again?",
      );
      return;
    }
    await navigate({ to: safeNext(next, "/") });
  }

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in with your workspace email and password."
      mood="idle"
      footer={
        <>
          <Link to="/forgot-password" className="font-medium text-accent-fill hover:underline">
            Forgot password?
          </Link>
          {" · "}
          <Link
            to="/sign-up"
            search={next ? { next } : undefined}
            className="font-medium text-accent-fill hover:underline"
          >
            Create account
          </Link>
        </>
      }
    >
      <div className="grid gap-4">
        <SocialButtons next={next} disabled={form.formState.isSubmitting} />
        <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FormAlert>{formError}</FormAlert>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Email</span>
            <input
              type="email"
              autoComplete="email"
              className={authInputClass}
              {...form.register("email")}
            />
            {form.formState.errors.email ? (
              <span className="text-danger-ink">{form.formState.errors.email.message}</span>
            ) : null}
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Password</span>
            <PasswordInput autoComplete="current-password" {...form.register("password")} />
            {form.formState.errors.password ? (
              <span className="text-danger-ink">{form.formState.errors.password.message}</span>
            ) : null}
          </label>
          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className={authSubmitClass}
          >
            {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
