import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { authClient } from "@/lib/auth/client";
import { AuthLayout } from "@/pages/sign-up";

const schema = z.object({ email: z.email("That email doesn't look right.") });

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit({ email }: z.infer<typeof schema>) {
    setFormError(null);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    if (error) {
      setFormError(
        error.status === 429
          ? "Too many tries. Give it a minute and try again."
          : "We couldn't send that. Try again in a moment.",
      );
      return;
    }
    await navigate({ to: "/reset-password", search: { email } });
  }

  return (
    <AuthLayout
      title="Forgot password"
      description="We'll email a code and a reset link."
      footer={
        <p className="text-center text-sm text-ink-muted">
          <Link to="/sign-in" className="font-medium text-accent-fill hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
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
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="h-10 rounded-control bg-accent-fill text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-60"
        >
          {form.formState.isSubmitting ? "Sending…" : "Send code and link"}
        </button>
      </form>
    </AuthLayout>
  );
}
