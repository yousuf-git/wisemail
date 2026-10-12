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
  const [data, setData] = useState<"keep" | "delete">("keep");
  const [typedDelete, setTypedDelete] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches =
    typed.trim() === connection.name && (data === "keep" || typedDelete.trim() === "DELETE");

  async function remove() {
    setPending(true);
    setError(null);
    const result = await removeConnectionAction(orgSlug, {
      connectionId: connection.id,
      confirmName: typed,
      ...(data === "delete" ? { deleteSyncedData: true, confirmDelete: typedDelete } : {}),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast.success(
      data === "delete"
        ? `Removed “${connection.name}”. Its synced data is being deleted in the background.`
        : `Removed “${connection.name}”`,
    );
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
          setData("keep");
          setTypedDelete("");
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
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">What about the synced data?</legend>
          {(
            [
              {
                value: "keep",
                title: "Keep it, read-only",
                body: "Mail, domains, contacts and templates stay visible. Nothing new arrives. You can delete them later from Trash or by cleanup rules.",
              },
              {
                value: "delete",
                title: "Delete the synced data too",
                body: "Erases this account's mail (bodies and files included), domains, contacts, segments, topics, templates, broadcasts and API key records from Wisemail. Other accounts are not touched. Insight totals stay. Resend keeps its own copy.",
              },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                data === option.value
                  ? "border-accent bg-accent-soft"
                  : "border-line hover:bg-canvas"
              }`}
            >
              <input
                type="radio"
                name={`data-${connection.id}`}
                value={option.value}
                checked={data === option.value}
                onChange={() => setData(option.value)}
                className="mt-1 accent-[var(--accent)]"
              />
              <span className="grid gap-0.5">
                <span className="font-semibold">{option.title}</span>
                <span className="text-ink-muted">{option.body}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {data === "delete" ? (
          <div className="grid gap-2">
            <Label htmlFor={`confirm-data-${connection.id}`}>
              Type <b className="font-semibold">DELETE</b> to erase the synced data
            </Label>
            <Input
              id={`confirm-data-${connection.id}`}
              value={typedDelete}
              onChange={(e) => setTypedDelete(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ) : null}
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
            {pending
              ? "Removing…"
              : data === "delete"
                ? "Remove and delete data"
                : "Remove connection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
