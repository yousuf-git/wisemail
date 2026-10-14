import { useEffect, useRef, useState } from "react";

import { createProject, updateProject } from "@/lib/actions";
import type { ProjectColor, ProjectRow } from "@/lib/api";

import { ProjectColorPicker } from "./project-color-picker";

/** Create (no `project`) or edit a project. */
export function ProjectDialog({
  orgSlug,
  project,
  open,
  onOpenChange,
  onSaved,
}: {
  orgSlug: string;
  project?: ProjectRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(project?.name ?? "");
  const [color, setColor] = useState<ProjectColor>(project?.color ?? "accent");
  const [description, setDescription] = useState(project?.description ?? "");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setColor(project?.color ?? "accent");
    setDescription(project?.description ?? "");
    setFields({});
    setFormError(null);
  }, [open, project]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFields({});
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setFields({ name: "Give it a name (2+ characters)." });
      return;
    }
    setBusy(true);
    const input = {
      name: trimmed,
      color,
      description: description.trim() || undefined,
    };
    const result = project
      ? await updateProject(orgSlug, { ...input, projectId: project.id })
      : await createProject(orgSlug, input);
    setBusy(false);
    if (!result.ok) {
      const next: Record<string, string> = {};
      for (const [key, messages] of Object.entries(result.error.fieldErrors ?? {})) {
        if (messages[0]) next[key] = messages[0];
      }
      setFields(next);
      if (Object.keys(next).length === 0) setFormError(result.error.message);
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
      <form onSubmit={submit} className="grid gap-4 p-5" noValidate>
        <h2 className="text-xl font-semibold">{project ? "Edit project" : "New project"}</h2>
        {formError ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {formError}
          </p>
        ) : null}

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            placeholder="Acme storefront"
            maxLength={60}
            aria-invalid={!!fields.name}
            className="h-9 rounded-control border border-line bg-canvas px-3"
          />
          {fields.name ? (
            <span role="alert" className="text-xs text-danger-ink">
              {fields.name}
            </span>
          ) : null}
        </label>

        <div className="grid gap-1.5 text-sm">
          <span id="project-color-label" className="font-medium">
            Color
          </span>
          <ProjectColorPicker
            value={color}
            onChange={setColor}
            labelledBy="project-color-label"
          />
          {fields.color ? (
            <span role="alert" className="text-xs text-danger-ink">
              {fields.color}
            </span>
          ) : null}
        </div>

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">
            Description <span className="font-normal text-ink-muted">(optional)</span>
          </span>
          <textarea
            rows={2}
            value={description}
            maxLength={240}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-control border border-line bg-canvas px-3 py-2"
          />
          {fields.description ? (
            <span role="alert" className="text-xs text-danger-ink">
              {fields.description}
            </span>
          ) : null}
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-control border border-line px-3 text-sm font-medium hover:bg-canvas-sunken"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            {busy ? "Saving…" : project ? "Save" : "Create project"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
