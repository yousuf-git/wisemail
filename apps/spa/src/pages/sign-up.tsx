import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthShell, FormAlert } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { SocialButtons } from "@/components/auth/social-buttons";
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
    <AuthShell
      title="Create your account"
      description="A minute to start. Free plan, no card."
      mood="happy"
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/sign-in"
            search={next ? { next } : undefined}
            className="font-medium text-accent-fill hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <div className="grid gap-4">
        <SocialButtons next={next} disabled={form.formState.isSubmitting} />
        <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FormAlert>{formError}</FormAlert>
          <Field label="Your name" error={form.formState.errors.name?.message}>
            <input autoComplete="name" className={inputClass} {...form.register("name")} />
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
            <PasswordInput
              strength
              autoComplete="new-password"
              {...form.register("password")}
              value={form.watch("password")}
            />
          </Field>
          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="h-11 rounded-full bg-accent-fill text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-60"
          >
            {form.formState.isSubmitting ? "Creating…" : "Create account"}
          </button>
        </form>
      </div>
    </AuthShell>
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

/** Re-export for forgot/reset/verify pages. */
export { AuthLayout } from "@/components/auth/auth-shell";
