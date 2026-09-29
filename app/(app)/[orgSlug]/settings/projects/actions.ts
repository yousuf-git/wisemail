"use server";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import type { ProjectDTO } from "@/lib/dto/project";
import { createProject, softDeleteProject, updateProject } from "@/lib/services/projects";
import {
  createProjectSchema,
  deleteProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type DeleteProjectInput,
  type UpdateProjectInput,
} from "@/lib/validation/project";

const create = orgAction(
  { input: createProjectSchema, permission: "project:create" },
  ({ ctx, input }) => createProject(ctx, input),
);
const update = orgAction(
  { input: updateProjectSchema, permission: "project:update" },
  ({ ctx, input }) => updateProject(ctx, input),
);
const remove = orgAction(
  { input: deleteProjectSchema, permission: "project:delete" },
  ({ ctx, input }) => softDeleteProject(ctx, input),
);

export async function createProjectAction(
  orgSlug: string,
  input: CreateProjectInput,
): Promise<ActionResult<ProjectDTO>> {
  return create(orgSlug, input);
}

export async function updateProjectAction(
  orgSlug: string,
  input: UpdateProjectInput,
): Promise<ActionResult<ProjectDTO>> {
  return update(orgSlug, input);
}

export async function deleteProjectAction(
  orgSlug: string,
  input: DeleteProjectInput,
): Promise<ActionResult<{ id: string; unassigned: number; membersUnrestricted: number }>> {
  return remove(orgSlug, input);
}
