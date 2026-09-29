"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { renameConnectionAction } from "@/app/(app)/[orgSlug]/settings/connections/actions";
import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { ConnectionDTO } from "@/lib/dto/connection";
import { connectionNameSchema } from "@/lib/validation/connection";

const schema = z.object({ name: connectionNameSchema });
type Values = z.infer<typeof schema>;

export function RenameConnectionDialog({
  orgSlug,
  connection,
  open,
  onOpenChange,
}: {
  orgSlug: string;
  connection: ConnectionDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: connection.name },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    const result = await renameConnectionAction(orgSlug, {
      connectionId: connection.id,
      name: values.name,
    });
    if (!result.ok) {
      const nameError = result.error.fieldErrors?.name?.[0];
      if (nameError) form.setError("name", { message: nameError });
      else setFormError(result.error.message);
      return;
    }
    toast.success("Renamed");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) form.reset({ name: connection.name });
        else setFormError(null);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle className="text-xl">Rename connection</DialogTitle>
            </DialogHeader>
            <FormAlert>{formError}</FormAlert>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting} className="font-bold">
                {form.formState.isSubmitting ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
