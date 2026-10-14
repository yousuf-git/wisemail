
import { ActionFailure } from "@/lib/actions/action-core";
import { orgAction } from "@/lib/actions/org-action";
import type { ActionResult } from "@/lib/actions/result";
import type { CreatedApiKeyDTO } from "@/lib/dto/domain";
import { createApiKey, deleteApiKey } from "@/lib/services/api-keys";
import {
  createApiKeySchema,
  deleteApiKeySchema,
  type CreateApiKeyFormInput,
} from "@/lib/validation/domain";

// Sending keys need `apiKey:create` or `apiKey:createSending`; full access needs `apiKey:create`.
const create = orgAction({ id: "api-keys.create", input: createApiKeySchema }, ({ ctx, input }) => {
  const allowed =
    input.permission === "full_access"
      ? ctx.can("apiKey:create")
      : ctx.can("apiKey:create") || ctx.can("apiKey:createSending");
  if (!allowed) throw new ActionFailure("forbidden", "You don't have permission to do that.");
  return createApiKey(ctx, input);
});
const remove = orgAction(
  { id: "api-keys.remove", input: deleteApiKeySchema, permission: "apiKey:delete" },
  ({ ctx, input }) => deleteApiKey(ctx, input),
);

/** The secret in the result is shown once by the dialog and never stored. */
export async function createApiKeyAction(
  orgSlug: string,
  input: CreateApiKeyFormInput,
): Promise<ActionResult<CreatedApiKeyDTO>> {
  return create(orgSlug, input);
}

export async function deleteApiKeyAction(
  orgSlug: string,
  input: { apiKeyId: string; confirmName: string; acknowledgeInUse?: boolean },
): Promise<ActionResult<{ id: string; name: string }>> {
  return remove(orgSlug, input);
}
