"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { deleteDomainAction } from "@/app/(app)/[orgSlug]/domains/actions";
import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Deleting a domain removes it in Resend too, so the person types its name first (FED §6). */
export function DeleteDomainDialog({
  orgSlug,
  domain,
  open,
  onOpenChange,
  redirectTo,
}: {
  orgSlug: string;
  domain: { id: string; name: string; senderCount: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where to go after deleting (the detail page returns to the list). */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === domain.name.toLowerCase();

  async function remove() {
    setPending(true);
    setError(null);
    const result = await deleteDomainAction(orgSlug, { domainId: domain.id, confirmName: typed });
    setPending(false);
    if (!result.ok) return void setError(result.error.message);
    const { sendersAffected } = result.data;
    toast.success(
      sendersAffected > 0
        ? `Deleted ${domain.name}. ${sendersAffected} ${sendersAffected === 1 ? "sender is" : "senders are"} off now.`
        : `Deleted ${domain.name}`,
    );
    onOpenChange(false);
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setTyped("");
          setError(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Delete {domain.name}?</DialogTitle>
          <DialogDescription>
            This also deletes the domain in Resend, so nothing can be sent from it anymore.
            {domain.senderCount > 0
              ? ` ${domain.senderCount} ${domain.senderCount === 1 ? "sender" : "senders"} on it will stop working (they stay in Wisemail for history), and queued emails that use them will need another sender.`
              : ""}{" "}
            Past emails stay in Wisemail.
          </DialogDescription>
        </DialogHeader>
        <FormAlert>{error}</FormAlert>
        <div className="grid gap-2">
          <Label htmlFor={`confirm-domain-${domain.id}`}>
            Type <b className="font-semibold">{domain.name}</b> to confirm
          </Label>
          <Input
            id={`confirm-domain-${domain.id}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={remove} disabled={!matches || pending}>
            {pending ? "Deleting…" : "Delete domain"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
