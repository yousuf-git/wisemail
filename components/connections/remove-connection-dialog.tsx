"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { removeConnectionAction } from "@/app/(app)/[orgSlug]/settings/connections/actions";
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
import type { ConnectionDTO } from "@/lib/dto/connection";

/** Destructive confirmations for connections require typing the name (FED §6). */
export function RemoveConnectionDialog({
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
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim() === connection.name;

  async function remove() {
    setPending(true);
    setError(null);
    const result = await removeConnectionAction(orgSlug, {
      connectionId: connection.id,
      confirmName: typed,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast.success(`Removed “${connection.name}”`);
    onOpenChange(false);
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
          <DialogTitle className="text-xl">Remove “{connection.name}”?</DialogTitle>
          <DialogDescription>
            Wisemail deletes its webhook in Resend and erases the stored API key. New events from
            this account stop arriving. Your Resend account itself isn&apos;t touched.
          </DialogDescription>
        </DialogHeader>
        <FormAlert>{error}</FormAlert>
        <div className="grid gap-2">
          <Label htmlFor={`confirm-${connection.id}`}>
            Type <b className="font-semibold">{connection.name}</b> to confirm
          </Label>
          <Input
            id={`confirm-${connection.id}`}
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
            {pending ? "Removing…" : "Remove connection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
