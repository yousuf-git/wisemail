"use server";

import { z } from "zod";

import { orgAction } from "@/lib/actions/org-action";
import type { ActionResult } from "@/lib/actions/result";
import type { TemplateDTO } from "@/lib/dto/audience";
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  updateTemplate,
} from "@/lib/services/templates";
import {
  createTemplateInput,
  duplicateTemplateInput,
  objectId,
  updateTemplateInput,
  type CreateTemplateInput,
  type UpdateTemplateInput,
} from "@/lib/validation/audience";

const create = orgAction(
  { id: "templates.create", input: createTemplateInput, permission: "template:create" },
  ({ ctx, input }) => createTemplate(ctx, input),
);
const update = orgAction(
  { id: "templates.update", input: updateTemplateInput, permission: "template:update" },
  ({ ctx, input }) => updateTemplate(ctx, input),
);
const duplicate = orgAction(
  { id: "templates.duplicate", input: duplicateTemplateInput, permission: "template:create" },
  ({ ctx, input }) => duplicateTemplate(ctx, input),
);
const remove = orgAction(
  { id: "templates.remove", input: z.object({ id: objectId }), permission: "template:delete" },
  async ({ ctx, input }) => {
    await deleteTemplate(ctx, input.id);
    return { id: input.id };
  },
);

export async function createTemplateAction(
  orgSlug: string,
  input: CreateTemplateInput,
): Promise<ActionResult<TemplateDTO>> {
  return create(orgSlug, input);
}
export async function updateTemplateAction(
  orgSlug: string,
  input: UpdateTemplateInput,
): Promise<ActionResult<TemplateDTO>> {
  return update(orgSlug, input);
}
export async function duplicateTemplateAction(
  orgSlug: string,
  input: z.input<typeof duplicateTemplateInput>,
): Promise<ActionResult<TemplateDTO>> {
  return duplicate(orgSlug, input);
}
export async function deleteTemplateAction(
  orgSlug: string,
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  return remove(orgSlug, input);
}
