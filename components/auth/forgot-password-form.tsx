"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

const schema = z.object({ email: z.email("That email doesn't look right.") });

export function ForgotPasswordForm({ devOutbox }: { devOutbox?: boolean }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
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
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="grid gap-4" data-testid="reset-sent">
        <div className="flex items-start gap-3 rounded-lg bg-accent-soft p-3.5">
          <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
          <p className="text-sm text-ink-secondary">
            If there&apos;s an account for <b className="font-semibold text-ink">{sentTo}</b>, a
            reset link is on its way. It works for an hour.
          </p>
        </div>
        {devOutbox ? (
          <p className="rounded-md bg-canvas-sunken px-3 py-2 text-[0.8125rem] text-ink-secondary">
            Development mode: nothing is really sent.{" "}
            <Link
              href="/dev/outbox"
              target="_blank"
              className="font-semibold text-accent hover:underline"
            >
              Open the dev outbox
            </Link>{" "}
            to find the link.
          </p>
        ) : null}
        <Button asChild variant="outline" size="lg">
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <FormAlert>{formError}</FormAlert>
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
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
        <p className="text-center text-sm text-ink-muted">
          <Link href="/sign-in" className="font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </Form>
  );
}
