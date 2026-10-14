import { useEffect, useRef, useState } from "react";

import { deleteSender } from "@/lib/actions";
import type { Sender } from "@/lib/api";

export function DeleteSenderDialog({
  orgSlug,
  sender,
  open,
  onOpenChange,
  onDeleted,
}: {
  orgSlug: string;
  sender: Sender;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await deleteSender(orgSlug, sender.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onDeleted();
    onOpenChange(false);
  }

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-md rounded-xl border border-line bg-surface p-0 text-ink shadow-lg backdrop:bg-ink/40"
      onClose={() => {
        if (open) onOpenChange(false);
      }}
    >
      <div className="grid gap-4 p-5">
        <div>
          <h2 className="text-xl font-semibold">Delete {sender.address}?</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Emails already sent keep their history. Drafts that use this sender will need another
            one, and emails still waiting to send will be flagged.
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-control border border-line px-3 text-sm font-medium hover:bg-canvas-sunken"
          >
            Keep it
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className="h-9 rounded-control bg-danger px-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete sender"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
