import { useEffect, useRef, useState } from "react";

import { removeMember } from "@/lib/actions";
import type { MemberRow } from "@/lib/api";

export function RemoveMemberDialog({
  orgSlug,
  member,
  open,
  onOpenChange,
  onRemoved,
}: {
  orgSlug: string;
  member: MemberRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
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

  async function remove() {
    setPending(true);
    setError(null);
    const result = await removeMember(orgSlug, member.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onRemoved();
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
          <h2 className="text-xl font-semibold">Remove {member.name}?</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {member.email} loses access to this workspace right away. Their account and anything
            they did here stay as they are.
          </p>
        </div>
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-control border border-line px-3 text-sm font-medium hover:bg-canvas-sunken disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void remove()}
            className="h-9 rounded-control bg-danger px-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Removing…" : "Remove member"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
