import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div>
        <p className="text-sm font-semibold tracking-tight text-accent-fill">Wisemail</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">Use your workspace email and password.</p>
      </div>
      <form
        className="grid gap-4 rounded-lg border border-line bg-surface p-5 shadow-sm"
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
      >
        {formError ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Email</span>
          <input
            type="email"
            autoComplete="email"
            className="h-10 rounded-control border border-line-strong bg-canvas px-3 outline-none focus:ring-2 focus:ring-accent"
            {...form.register("email")}
          />
          {form.formState.errors.email ? (
            <span className="text-danger-ink">{form.formState.errors.email.message}</span>
          ) : null}
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            className="h-10 rounded-control border border-line-strong bg-canvas px-3 outline-none focus:ring-2 focus:ring-accent"
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <span className="text-danger-ink">{form.formState.errors.password.message}</span>
          ) : null}
        </label>
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="h-10 rounded-control bg-accent-fill text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-60"
        >
          {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="text-center text-sm text-ink-muted">
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
      </p>
    </div>
  );
}
