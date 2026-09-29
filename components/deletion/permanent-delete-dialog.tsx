"use client";

import { useState } from "react";

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

const nf = new Intl.NumberFormat("en-US");
export const formatCount = (n: number) => nf.format(n);

/**
 * Confirmation for deleting mail for good (PRD §5.16, UC-37). Says what really happens: Wisemail's
 * copy goes, Resend keeps its own until its retention ends. `typeCount` (bulk and "all matching")
 * makes the person type the number.
 */
export function PermanentDeleteDialog({
  open,
  onOpenChange,
  count,
  noun = "emails",
  title,
  confirmLabel = "Delete permanently",
  typeCount = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  noun?: string;
  title?: string;
  confirmLabel?: string;
  typeCount?: boolean;
  /** Resolves to an error message, or null when it worked (the dialog then closes). */
  onConfirm: (typed: number | undefined) => Promise<string | null>;
}) {
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = formatCount(count);
  const matches = !typeCount || typed.replace(/[,\s]/g, "") === String(count);

  async function confirm() {
    setPending(true);
    setError(null);
    const message = await onConfirm(typeCount ? count : undefined);
    setPending(false);
    if (message) {
      setError(message);
      return;
    }
    setTyped("");
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
        if (!next) {
          setTyped("");
          setError(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {title ?? `Delete ${label} ${noun} permanently?`}
          </DialogTitle>
          <DialogDescription>
            Deleted from Wisemail for good. Resend keeps its copy until its own retention ends.
            Bodies and files are removed, and deleted emails never come back through sync or late
            events. Insights and usage stay as they are.
          </DialogDescription>
        </DialogHeader>
        <FormAlert>{error}</FormAlert>
        {typeCount ? (
          <div className="grid gap-2">
            <Label htmlFor="confirm-delete-count">
              Type <b className="font-semibold">{label}</b> to confirm
            </Label>
            <Input
              id="confirm-delete-count"
              inputMode="numeric"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={!matches || pending}>
            {pending ? "Deleting…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
