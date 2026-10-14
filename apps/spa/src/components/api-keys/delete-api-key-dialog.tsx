import { useEffect, useRef, useState } from "react";

import { deleteApiKey } from "@/lib/actions";
import type { ApiKeyRow } from "@/lib/api";

/** Revoke/delete with name confirm; blocks Wisemail's own key (exact inUse). */
export function DeleteApiKeyDialog({
  orgSlug,
  apiKey,
  open,
  onOpenChange,
  onDeleted,
}: {
  orgSlug: string;
  apiKey: ApiKeyRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exact = apiKey.inUse === "exact";
  const possible = apiKey.inUse === "possible";
  const matches = typed.trim() === apiKey.name.trim();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setTyped("");
      setAcknowledged(false);
      setError(null);
    }
  }, [open]);

  async function remove() {
    setPending(true);
    setError(null);
    const result = await deleteApiKey(orgSlug, {
      apiKeyId: apiKey.id,
      confirmName: typed,
      acknowledgeInUse: acknowledged,
    });
    setPending(false);
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
          <h2 className="text-xl font-semibold">Delete “{apiKey.name}”?</h2>
          <p className="mt-1 text-sm text-ink-muted">
            This deletes the key in Resend ({apiKey.connectionName}). Anything still using it, like
            an app or a server, stops being able to send right away. This can&apos;t be undone.
          </p>
        </div>

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

        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        ) : null}

        {exact ? null : (
          <>
            <label className="grid gap-1.5 text-sm">
              <span>
                Type <b className="font-semibold">{apiKey.name}</b> to confirm
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="h-9 rounded-control border border-line bg-canvas px-3"
              />
            </label>
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
            onClick={() => void remove()}
            disabled={exact || !matches || pending || (possible && !acknowledged)}
            className="h-9 rounded-control bg-danger px-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete key"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
