"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { deleteApiKeyAction } from "@/app/(app)/[orgSlug]/api-keys/actions";
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
import type { ApiKeyDTO } from "@/lib/dto/domain";

/**
 * Deleting a key also deletes it in Resend, so anything using it stops working at once. The key
 * Wisemail itself uses can't be deleted here; a key that might be it needs one more tick.
 */
export function DeleteApiKeyDialog({
  orgSlug,
  apiKey,
  open,
  onOpenChange,
}: {
  orgSlug: string;
  apiKey: ApiKeyDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exact = apiKey.inUse === "exact";
  const possible = apiKey.inUse === "possible";
  const matches = typed.trim() === apiKey.name.trim();

  async function remove() {
    setPending(true);
    setError(null);
    const result = await deleteApiKeyAction(orgSlug, {
      apiKeyId: apiKey.id,
      confirmName: typed,
      acknowledgeInUse: acknowledged,
    });
    setPending(false);
    if (!result.ok) return void setError(result.error.message);
    toast.success(`Deleted ${apiKey.name}`);
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
          setAcknowledged(false);
          setError(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Delete “{apiKey.name}”?</DialogTitle>
          <DialogDescription>
            This deletes the key in Resend ({apiKey.connectionName}). Anything still using it, like
            an app or a server, stops being able to send right away. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        {exact ? (
          <p
            role="alert"
            className="rounded-md bg-warning-soft px-3 py-2.5 text-[0.8125rem] leading-snug text-warning-ink"
          >
            Wisemail uses this key to talk to {apiKey.connectionName}
            {apiKey.connectionKeyLast4 ? ` (it ends in ${apiKey.connectionKeyLast4})` : ""}.
            Deleting it would disconnect the account, so it isn&apos;t allowed here. Add a new key
            under Settings → Connections first.
          </p>
        ) : null}
        {possible ? (
          <p
            role="alert"
            className="rounded-md bg-warning-soft px-3 py-2.5 text-[0.8125rem] leading-snug text-warning-ink"
          >
            This key may be the one Wisemail uses for {apiKey.connectionName}
            {apiKey.connectionKeyLast4 ? ` (that key ends in ${apiKey.connectionKeyLast4})` : ""}.
            Deleting it would cut the account off until you add a new key.
          </p>
        ) : null}

        <FormAlert>{error}</FormAlert>
        {exact ? null : (
          <>
            <div className="grid gap-2">
              <Label htmlFor={`confirm-key-${apiKey.id}`}>
                Type <b className="font-semibold">{apiKey.name}</b> to confirm
              </Label>
              <Input
                id={`confirm-key-${apiKey.id}`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {possible ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--color-accent)]"
                />
                I understand Wisemail may lose access to {apiKey.connectionName}
              </label>
            ) : null}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={remove}
            disabled={exact || !matches || pending || (possible && !acknowledged)}
          >
            {pending ? "Deleting…" : "Delete key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
