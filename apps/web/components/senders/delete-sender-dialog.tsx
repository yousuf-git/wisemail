"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { deleteSenderAction } from "@/app/(app)/[orgSlug]/settings/senders/actions";
import { friendlyError } from "@/components/composer/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SenderDTO } from "@/lib/dto/mail";

export function DeleteSenderDialog({
  orgSlug,
  sender,
  open,
  onOpenChange,
}: {
  orgSlug: string;
  sender: SenderDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await deleteSenderAction(orgSlug, { id: sender.id });
    setBusy(false);
    if (!result.ok) return setError(friendlyError(result.error).message);
    toast.success(`Deleted ${sender.address}`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Delete {sender.address}?</DialogTitle>
          <DialogDescription>
            Emails already sent keep their history. Drafts that use this sender will need another
            one, and emails still waiting to send will be flagged.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? "Deleting…" : "Delete sender"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
