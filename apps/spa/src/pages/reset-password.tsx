import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthShell, FormAlert, FormNotice, authSubmitClass } from "@/components/auth/auth-shell";
import { OtpInput } from "@/components/auth/otp-input";
import { PasswordInput } from "@/components/auth/password-input";
import { authClient } from "@/lib/auth/client";

const OTP_LENGTH = 6;

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
    return <ResetCodeForm email={email} />;
  }

  if (!token) {
    return (
      <AuthShell title="Reset password" description="That link is missing a token." mood="worried">
        <Link
          to="/forgot-password"
          className="text-sm font-medium text-accent-fill hover:underline"
        >
          Request a new link
        </Link>
      </AuthShell>
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
    <AuthShell
      title="Choose a new password"
      description="Make it at least 8 characters."
      mood="idle"
      footer={
        <Link to="/forgot-password" className="font-medium text-accent-fill hover:underline">
          Send me a new link
        </Link>
      }
    >
      <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FormAlert>{formError}</FormAlert>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">New password</span>
          <PasswordInput
            strength
            autoComplete="new-password"
            {...form.register("password")}
            value={form.watch("password")}
          />
          {form.formState.errors.password ? (
            <span className="text-danger-ink">{form.formState.errors.password.message}</span>
          ) : null}
        </label>
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className={authSubmitClass}
        >
          {form.formState.isSubmitting ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthShell>
  );
}

function ResetCodeForm({ email }: { email: string }) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [boxes, setBoxes] = useState(0);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "" },
  });

  async function onSubmit({ password }: z.infer<typeof schema>) {
    setFormError(null);
    setMessage(null);
    if (code.length !== OTP_LENGTH) {
      setCodeError(true);
      setFormError("Enter the 6-digit code from your email.");
      return;
    }
    setCodeError(false);
    const { error } = await authClient.emailOtp.resetPassword({ email, otp: code, password });
    if (error) {
      setFormError(
        error.status === 429
          ? "Too many tries. Give it a minute and try again."
          : error.code === "OTP_EXPIRED"
            ? "That code expired. Ask for a new one."
            : "That code didn't work. Try again?",
      );
      setCodeError(true);
      setCode("");
      setBoxes((n) => n + 1);
      return;
    }
    await navigate({ to: "/sign-in", search: { next: undefined } });
  }

  async function resend() {
    setSending(true);
    setFormError(null);
    setMessage(null);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setSending(false);
    if (error) {
      setFormError(
        error.status === 429
          ? "Too many tries. Give it a minute and try again."
          : "We couldn't send that. Try again in a moment.",
      );
      return;
    }
    setMessage("Sent again. The new code replaces the old one.");
    setCode("");
    setCodeError(false);
    setBoxes((n) => n + 1);
  }

  return (
    <AuthShell
      title="Check your inbox"
      description="Use the code from the email, or open the reset link."
      mood="thinking"
      footer={
        <Link to="/forgot-password" className="font-medium text-accent-fill hover:underline">
          Send again
        </Link>
      }
    >
      <div className="grid gap-5" data-testid="reset-sent">
        <div className="flex items-start gap-3 rounded-lg bg-accent-soft p-3.5">
          <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-fill" />
          <p className="text-sm text-ink-secondary">
            If there&apos;s an account for{" "}
            <b className="font-semibold break-all text-ink">{email}</b>, a 6-digit code and a reset
            link are on their way.
          </p>
        </div>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          <FormAlert>{formError}</FormAlert>
          <FormNotice>{message}</FormNotice>
          <div className="grid gap-2">
            <p className="text-sm font-medium">Code from your email</p>
            <OtpInput
              key={boxes}
              value={code}
              onChange={setCode}
              length={OTP_LENGTH}
              disabled={form.formState.isSubmitting}
              invalid={codeError}
              autoFocus
            />
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">New password</span>
            <PasswordInput
              strength
              autoComplete="new-password"
              {...form.register("password")}
              value={form.watch("password")}
            />
            {form.formState.errors.password ? (
              <span className="text-danger-ink">{form.formState.errors.password.message}</span>
            ) : null}
          </label>
          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className={authSubmitClass}
          >
            {form.formState.isSubmitting ? "Saving…" : "Save new password"}
          </button>
        </form>
        <button
          type="button"
          disabled={sending}
          onClick={() => void resend()}
          className="justify-self-start text-sm font-medium text-accent-fill hover:underline disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send a new code"}
        </button>
      </div>
    </AuthShell>
  );
}
