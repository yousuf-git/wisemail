import { useState } from "react";
import { FolderKanban, MoreHorizontal, Plus } from "lucide-react";

import { ResourceEmpty } from "@/components/resource-page";
import type { ProjectRow, ProjectsPagePayload } from "@/lib/api";

import { DeleteProjectDialog } from "./delete-project-dialog";
import { ProjectDialog } from "./project-dialog";
import { ProjectDot } from "./project-color-picker";

export function ProjectsView({
  orgSlug,
  data,
  onChanged,
}: {
  orgSlug: string;
  data: ProjectsPagePayload;
  onChanged: () => void;
}) {
  const { projects, quota, can } = data;
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [deleting, setDeleting] = useState<ProjectRow | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const atLimit = quota.limit !== null && quota.used >= quota.limit;

  const newButton = can.create ? (
    <button
      type="button"
      onClick={() => setCreating(true)}
      disabled={atLimit}
      className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent-fill px-3 text-xs font-semibold text-accent-ink disabled:opacity-50"
    >
      <Plus aria-hidden className="size-3.5" /> New project
    </button>
  ) : null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted" data-testid="project-quota">
          {quota.limit === null
            ? `${quota.used} ${quota.used === 1 ? "project" : "projects"} · unlimited on ${quota.planLabel}`
            : `${quota.used} of ${quota.limit} ${quota.limit === 1 ? "project" : "projects"} on ${quota.planLabel}`}
          {atLimit && quota.nextTierLabel ? ` · ${quota.nextTierLabel} adds more` : ""}
        </p>
        {projects.length > 0 ? newButton : null}
      </div>

      {projects.length === 0 ? (
        <div className="grid gap-3">
          <ResourceEmpty>
            {can.create
              ? "Projects keep each product or client together, so insights, the inbox and member access can follow them."
              : "Only Owners and Admins can create projects."}
          </ResourceEmpty>
          {newButton}
        </div>
      ) : (
        <ul className="grid gap-3" aria-label="Projects">
          {projects.map((project) => (
            <li
              key={project.id}
              className="relative flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm min-[560px]:px-5"
            >
              <div className="flex min-w-0 items-start gap-3">
                <ProjectDot color={project.color} className="mt-2 size-3" />
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold">{project.name}</h2>
                  {project.description ? (
                    <p className="truncate text-sm text-ink-muted">{project.description}</p>
                  ) : null}
                  <p className="mt-1 text-[0.8125rem] text-ink-secondary">
                    {project.domainCount} {project.domainCount === 1 ? "domain" : "domains"} ·{" "}
                    {project.scopedMemberCount}{" "}
                    {project.scopedMemberCount === 1 ? "member" : "members"} limited to it
                  </p>
                </div>
              </div>
              {can.update || can.delete ? (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    aria-label={`Actions for ${project.name}`}
                    aria-expanded={menuId === project.id}
                    onClick={() => setMenuId((id) => (id === project.id ? null : project.id))}
                    className="inline-flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-canvas-sunken"
                  >
                    <MoreHorizontal aria-hidden className="size-4" />
                  </button>
                  {menuId === project.id ? (
                    <div
                      role="menu"
                      className="absolute top-9 right-0 z-20 grid min-w-[9rem] overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg"
                    >
                      {can.update ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="px-3 py-2 text-left text-sm hover:bg-canvas-sunken"
                          onClick={() => {
                            setMenuId(null);
                            setEditing(project);
                          }}
                        >
                          Edit
                        </button>
                      ) : null}
                      {can.delete ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="px-3 py-2 text-left text-sm text-danger-ink hover:bg-danger-soft"
                          onClick={() => {
                            setMenuId(null);
                            setDeleting(project);
                          }}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!can.create && projects.length > 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <FolderKanban aria-hidden className="size-4" />
          Only Owners and Admins can create, edit or delete projects.
        </p>
      ) : null}

      {can.create ? (
        <ProjectDialog
          orgSlug={orgSlug}
          open={creating}
          onOpenChange={setCreating}
          onSaved={onChanged}
        />
      ) : null}
      {editing ? (
        <ProjectDialog
          key={editing.id}
          orgSlug={orgSlug}
          project={editing}
          open
          onOpenChange={(next) => !next && setEditing(null)}
          onSaved={onChanged}
        />
      ) : null}
      {deleting ? (
        <DeleteProjectDialog
          orgSlug={orgSlug}
          project={deleting}
          open
          onOpenChange={(next) => !next && setDeleting(null)}
          onDeleted={onChanged}
        />
      ) : null}
    </div>
  );
}
