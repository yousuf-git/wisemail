import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { authClient } from "@/lib/auth/client";
import { AuthLayout } from "@/pages/sign-up";

const schema = z.object({
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(128, "Keep it under 128 characters."),
});

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/reset-password" });
  const token = typeof search.token === "string" ? search.token : "";
  const email = typeof search.email === "string" ? search.email : "";
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "" },
  });

  if (!token && email) {
    return (
      <AuthLayout
        title="Check your inbox"
        description="Use the link in the email, or enter the code if your reset flow supports it."
        footer={
          <p className="text-center text-sm text-ink-muted">
            <Link to="/forgot-password" className="font-medium text-accent-fill hover:underline">
              Send again
            </Link>
          </p>
        }
      >
        <p className="text-sm text-ink-secondary">
          We sent reset instructions to <strong className="text-ink">{email}</strong>. Open the
          link to choose a new password.
        </p>
      </AuthLayout>
    );
  }

  if (!token) {
    return (
      <AuthLayout title="Reset password" description="That link is missing a token.">
        <Link
          to="/forgot-password"
          className="text-sm font-medium text-accent-fill hover:underline"
        >
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  async function onSubmit({ password }: z.infer<typeof schema>) {
    setFormError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setFormError(
        error.status === 429
          ? "Too many tries. Give it a minute and try again."
          : "That reset link doesn't work anymore. Ask for a new one.",
      );
      return;
    }
    await navigate({ to: "/sign-in", search: { next: undefined } });
  }

  return (
    <AuthLayout
      title="Choose a new password"
      description="Make it at least 8 characters."
      footer={
        <p className="text-center text-sm text-ink-muted">
          <Link to="/forgot-password" className="font-medium text-accent-fill hover:underline">
            Send me a new link
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
          <span className="font-medium">New password</span>
          <input
            type="password"
            autoComplete="new-password"
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
          {form.formState.isSubmitting ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthLayout>
  );
}
