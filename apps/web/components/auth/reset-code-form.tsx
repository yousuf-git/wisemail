"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormAlert, FormNotice } from "@/components/auth/auth-shell";
import {
  DevOutboxHint,
  ExpiryText,
  otpErrorMessage,
  useCodeClocks,
} from "@/components/auth/code-form-parts";
import { OtpInput } from "@/components/auth/otp-input";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { authClient } from "@/lib/auth/client";
import { OTP_LENGTH } from "@/lib/auth/otp-config";
import { signUpSchema } from "@/lib/validation/auth";

const schema = z.object({ password: signUpSchema.shape.password });

/**
 * Reset with the 6-digit code from the email: code first, then the new password. The same email
 * carries a link that opens the token form instead. The message never says whether the address
 * has an account.
 */
export function ResetCodeForm({ email, devOutbox }: { email: string; devOutbox?: boolean }) {
  const router = useRouter();
  const clocks = useCodeClocks();
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
      const { message: copy, needsNewCode } = otpErrorMessage(error);
      setFormError(copy);
      setCodeError(true);
      if (needsNewCode) clocks.allowResendNow();
      if (error.code === "OTP_EXPIRED") clocks.markExpired();
      setCode("");
      setBoxes((n) => n + 1);
      return;
    }
    router.replace("/sign-in?reset=1");
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
    clocks.restart();
  }

  return (
    <div className="grid gap-5" data-testid="reset-sent">
      <div className="flex items-start gap-3 rounded-lg bg-accent-soft p-3.5">
        <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-fill" />
        <p className="text-sm text-ink-secondary">
          If there&apos;s an account for <b className="font-semibold break-all text-ink">{email}</b>
          , a 6-digit code and a reset link are on their way.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          <FormAlert>{formError}</FormAlert>
          <FormNotice>{message}</FormNotice>
          <div className="grid gap-2">
            <p className="text-sm font-medium" id="reset-otp-label">
              Code from your email
            </p>
            <OtpInput
              key={boxes}
              idPrefix="reset-otp"
              label="6-digit reset code"
              value={code}
              onChange={(value) => {
                setCode(value);
                setCodeError(false);
              }}
              invalid={codeError}
              autoFocus
            />
            <p className="text-[0.8125rem] text-ink-muted" data-testid="otp-expiry">
              <ExpiryText seconds={clocks.expiresIn} />
            </p>
          </div>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" strength {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            size="lg"
            className="h-11 rounded-full font-semibold"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Saving…" : "Save new password"}
          </Button>
        </form>
      </Form>

      <Button
        variant="outline"
        size="lg"
        className="h-11 rounded-full font-medium"
        onClick={resend}
        disabled={sending || clocks.cooldown > 0}
      >
        {sending
          ? "Sending…"
          : clocks.cooldown > 0
            ? `Resend code in ${clocks.cooldown}s`
            : "Send a new code"}
      </Button>
      {devOutbox ? <DevOutboxHint what="code" /> : null}
      <p className="text-center text-sm text-ink-muted">
        <Link href="/forgot-password" className="font-medium text-accent-fill hover:underline">
          Use a different email
        </Link>
      </p>
    </div>
  );
}
