"use client";

import { FolderKanban, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectDTO, ProjectQuota } from "@/lib/dto/project";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { ProjectDialog } from "./project-dialog";
import { ProjectDot } from "./project-color-picker";

export type ProjectPermissions = { create: boolean; update: boolean; delete: boolean };

export function ProjectsView({
  orgSlug,
  projects,
  quota,
  can,
}: {
  orgSlug: string;
  projects: ProjectDTO[];
  quota: ProjectQuota;
  can: ProjectPermissions;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProjectDTO | null>(null);
  const [deleting, setDeleting] = useState<ProjectDTO | null>(null);
  const atLimit = quota.limit !== null && quota.used >= quota.limit;

  const newButton = can.create ? (
    <Button onClick={() => setCreating(true)} disabled={atLimit} className="font-bold">
      <Plus aria-hidden /> New project
    </Button>
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
        <EmptyState title="Group your domains into projects" mood="idle" action={newButton}>
          {can.create
            ? "Projects keep each product or client together, so insights, the inbox and member access can follow them."
            : "Only Owners and Admins can create projects."}
        </EmptyState>
      ) : (
        <ul className="grid gap-3" aria-label="Projects">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-surface p-4 shadow-md min-[560px]:px-5"
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Actions for ${project.name}`}
                    >
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40 rounded-lg shadow-lg">
                    {can.update ? (
                      <DropdownMenuItem onSelect={() => setEditing(project)}>Edit</DropdownMenuItem>
                    ) : null}
                    {can.update && can.delete ? <DropdownMenuSeparator /> : null}
                    {can.delete ? (
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(project)}>
                        Delete
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
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

      <ProjectDialog orgSlug={orgSlug} open={creating} onOpenChange={setCreating} />
      {editing ? (
        <ProjectDialog
          key={editing.id}
          orgSlug={orgSlug}
          project={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <DeleteProjectDialog
          orgSlug={orgSlug}
          project={deleting}
          open
          onOpenChange={(open) => !open && setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
