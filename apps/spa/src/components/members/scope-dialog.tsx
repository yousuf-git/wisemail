import { useEffect, useRef, useState } from "react";

import { setMemberScope } from "@/lib/actions";
import type { MemberProjectOption, MemberRow } from "@/lib/api";

import { ProjectChecklist } from "./project-checklist";

export function ScopeDialog({
  orgSlug,
  member,
  projects,
  open,
  onOpenChange,
  onSaved,
}: {
  orgSlug: string;
  member: MemberRow;
  projects: MemberProjectOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState<string[]>(member.projectIds ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (open) {
      setValue(member.projectIds ?? []);
      setError(null);
    }
  }, [open, member]);

  async function save() {
    setPending(true);
    setError(null);
    const result = await setMemberScope(orgSlug, member.id, value);
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onSaved();
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
          <h2 className="text-xl font-semibold">Project access for {member.name}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Limited members only see data from the projects you check. Uncheck everything to give
            access to the whole workspace.
          </p>
        </div>
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        {projects.length === 0 ? (
          <p className="text-sm text-ink-muted">Create a project first, then limit access to it.</p>
        ) : (
          <ProjectChecklist
            name={`scope-${member.id}`}
            projects={projects}
            value={value}
            onChange={setValue}
          />
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
            disabled={pending}
            onClick={() => void save()}
            className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save access"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
