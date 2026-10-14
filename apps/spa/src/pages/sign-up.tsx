import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { authClient } from "@/lib/auth/client";
import { safeNext } from "@/lib/auth/safe-next";

const signUpSchema = z.object({
  name: z.string().trim().min(2, "What should we call you?").max(80),
  email: z.email("That email doesn't look right."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(128, "Keep it under 128 characters."),
});
type SignUpInput = z.infer<typeof signUpSchema>;

export function SignUpPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/sign-up" });
  const next = typeof search.next === "string" ? search.next : undefined;
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit(values: SignUpInput) {
    setFormError(null);
    const { error } = await authClient.signUp.email({
      ...values,
      callbackURL: safeNext(next, "/"),
    });
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
    const params = new URLSearchParams({ email: values.email });
    if (next) params.set("next", safeNext(next, "/"));
    await navigate({ to: "/verify-email", search: Object.fromEntries(params) });
  }

  return (
    <AuthLayout
      title="Create your account"
      description="A minute to start. Free plan, no card."
      footer={
        <p className="text-center text-sm text-ink-muted">
          Already have an account?{" "}
          <Link
            to="/sign-in"
            search={next ? { next } : undefined}
            className="font-medium text-accent-fill hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
      >
        {formError ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}
        <Field label="Your name" error={form.formState.errors.name?.message}>
          <input
            autoComplete="name"
            className={inputClass}
            {...form.register("name")}
          />
        </Field>
        <Field label="Email" error={form.formState.errors.email?.message}>
          <input
            type="email"
            autoComplete="email"
            className={inputClass}
            {...form.register("email")}
          />
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          <input
            type="password"
            autoComplete="new-password"
            className={inputClass}
            {...form.register("password")}
          />
        </Field>
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="h-10 rounded-control bg-accent-fill text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-60"
        >
          {form.formState.isSubmitting ? "Creating…" : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}

const inputClass =
  "h-10 rounded-control border border-line-strong bg-canvas px-3 outline-none focus:ring-2 focus:ring-accent";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error ? <span className="text-danger-ink">{error}</span> : null}
    </label>
  );
}

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div>
        <p className="text-sm font-semibold tracking-tight text-accent-fill">Wisemail</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{description}</p>
      </div>
      <div className="grid gap-4 rounded-lg border border-line bg-surface p-5 shadow-sm">{children}</div>
      {footer}
    </div>
  );
}
