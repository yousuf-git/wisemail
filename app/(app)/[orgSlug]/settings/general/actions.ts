"use server";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import {
  requestOrganizationDeletion,
  updateGeneralSettings,
  type GeneralSettingsDTO,
} from "@/lib/services/general-settings";
import {
  requestDeletionSchema,
  updateGeneralSchema,
  type RequestDeletionInput,
  type UpdateGeneralInput,
} from "@/lib/validation/general-settings";

const update = orgAction(
  { input: updateGeneralSchema, permission: "organization:update" },
  ({ ctx, input }) => updateGeneralSettings(ctx, input),
);
const requestDeletion = orgAction(
  { input: requestDeletionSchema, permission: "organization:delete" },
  ({ ctx, input }) => requestOrganizationDeletion(ctx, input),
);

export async function updateGeneralAction(
  orgSlug: string,
  input: UpdateGeneralInput,
): Promise<ActionResult<GeneralSettingsDTO>> {
  return update(orgSlug, input);
}

export async function requestDeletionAction(
  orgSlug: string,
  input: RequestDeletionInput,
): Promise<ActionResult<{ recorded: true }>> {
  return requestDeletion(orgSlug, input);
}
