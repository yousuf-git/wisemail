import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthShell, FormAlert } from "@/components/auth/auth-shell";
import { authClient } from "@/lib/auth/client";

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
    <AuthShell
      title="Forgot password"
      description="We'll email a code and a reset link."
      mood="thinking"
      footer={
        <Link to="/sign-in" className="font-medium text-accent-fill hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FormAlert>{formError}</FormAlert>
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
          className="h-11 rounded-full bg-accent-fill text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-60"
        >
          {form.formState.isSubmitting ? "Sending…" : "Send reset email"}
        </button>
      </form>
    </AuthShell>
  );
}
