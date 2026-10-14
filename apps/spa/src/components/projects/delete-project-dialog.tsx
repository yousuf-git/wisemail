import { useEffect, useRef, useState } from "react";

import { deleteProject } from "@/lib/actions";
import type { ProjectRow } from "@/lib/api";

export function DeleteProjectDialog({
  orgSlug,
  project,
  open,
  onOpenChange,
  onDeleted,
}: {
  orgSlug: string;
  project: ProjectRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
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
    const result = await deleteProject(orgSlug, project.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onDeleted();
    onOpenChange(false);
  }

  const s = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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
          <h2 className="text-xl font-semibold">Delete “{project.name}”?</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Its {s(project.domainCount, "domain", "domains")} become unassigned, and existing email
            keeps working. {s(project.scopedMemberCount, "member", "members")} limited to this
            project lose it; anyone left with no projects can see the whole workspace again.
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
            {pending ? "Deleting…" : "Delete project"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
