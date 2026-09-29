"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { addConnectionAction } from "@/app/(app)/[orgSlug]/settings/connections/actions";
import { FormAlert } from "@/components/auth/auth-shell";
import { Wizi } from "@/components/mascot/wizi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { ConnectionQuota } from "@/lib/dto/connection";
import { addConnectionSchema, type AddConnectionInput } from "@/lib/validation/connection";

export function AddConnectionDialog({
  orgSlug,
  quota,
  atLimit,
}: {
  orgSlug: string;
  quota: ConnectionQuota;
  atLimit: boolean;
}) {
  const router = useRouter();
  // `?connect=1` (the end of the welcome tour) opens the dialog right away.
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(searchParams.get("connect") === "1");
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<AddConnectionInput>({
    resolver: zodResolver(addConnectionSchema),
    defaultValues: { name: "", apiKey: "" },
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setFormError(null);
      form.reset();
    }
  }

  async function onSubmit(values: AddConnectionInput) {
    setFormError(null);
    const result = await addConnectionAction(orgSlug, values);
    if (!result.ok) {
      const { fieldErrors, message } = result.error;
      let placed = false;
      for (const field of ["name", "apiKey"] as const) {
        const first = fieldErrors?.[field]?.[0];
        if (first) {
          form.setError(field, { message: first });
          placed = true;
        }
      }
      if (!placed) setFormError(message);
      return;
    }
    const connection = result.data;
    if (connection.status === "active") {
      toast.success(`Connected “${connection.name}”`);
    } else {
      toast.warning(`Saved “${connection.name}”, but it needs attention`);
    }
    onOpenChange(false);
    router.refresh();
  }

  const submitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="font-bold" data-tour="connections-add">
          <Plus aria-hidden />
          Connect account
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[30rem]">
        {atLimit ? (
          <div className="grid justify-items-center gap-3 py-2 text-center">
            <Wizi mood="thinking" size={64} />
            <DialogHeader className="text-center">
              <DialogTitle className="text-xl">
                You&apos;ve connected {quota.used} of {quota.limit} Resend{" "}
                {quota.limit === 1 ? "account" : "accounts"} on {quota.planLabel}
              </DialogTitle>
              <DialogDescription>
                {quota.nextTierLabel ? (
                  <>
                    {quota.nextTierLabel} includes more connections.{" "}
                    <Link
                      href={`/${orgSlug}/settings/billing`}
                      className="font-semibold text-ink underline underline-offset-4"
                    >
                      See plans
                    </Link>{" "}
                    (Owners can upgrade), or remove a connection you no longer need to make room.
                  </>
                ) : (
                  "Remove a connection you no longer need to make room."
                )}
              </DialogDescription>
            </DialogHeader>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
              <DialogHeader>
                <DialogTitle className="text-xl">Connect a Resend account</DialogTitle>
                <DialogDescription>
                  Paste a <b className="font-semibold text-ink">Full access</b> API key. Wisemail
                  needs it to read your domains and emails and to set up its own webhook.
                  Sending-only keys can&apos;t do that. Create one in Resend → API Keys, with
                  permission &ldquo;Full access&rdquo;.
                </DialogDescription>
              </DialogHeader>

              <FormAlert>{formError}</FormAlert>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="off"
                        placeholder="Personal, or Client: Bakery"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full access API key</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="re_…"
                        className="font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Encrypted before it&apos;s saved and never shown again, only its last four
                      characters.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <p
                data-testid="webhook-slot-notice"
                className="rounded-md bg-info-soft px-3 py-2 text-[0.8125rem] leading-snug text-info-ink"
              >
                Wisemail&apos;s webhook uses one of your account&apos;s webhook endpoint slots
                (Resend Pro: 5, Scale: 10). If none are free, the connection is saved as{" "}
                <b className="font-semibold">Needs attention</b> until you free one.
              </p>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="font-bold">
                  {submitting ? "Connecting…" : "Connect account"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
