"use server";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import type { ConnectionDTO } from "@/lib/dto/connection";
import {
  addConnection,
  removeConnection,
  renameConnection,
  retryConnectionSetup,
} from "@/lib/services/connections";
import {
  addConnectionSchema,
  removeConnectionSchema,
  renameConnectionSchema,
  retryConnectionSchema,
  type AddConnectionInput,
  type RemoveConnectionInput,
  type RenameConnectionInput,
  type RetryConnectionInput,
} from "@/lib/validation/connection";

const add = orgAction(
  { input: addConnectionSchema, permission: "connection:create" },
  ({ ctx, input }) => addConnection(ctx, input),
);
const rename = orgAction(
  { input: renameConnectionSchema, permission: "connection:update" },
  ({ ctx, input }) => renameConnection(ctx, input),
);
const remove = orgAction(
  { input: removeConnectionSchema, permission: "connection:delete" },
  ({ ctx, input }) => removeConnection(ctx, input),
);
const retry = orgAction(
  { input: retryConnectionSchema, permission: "connection:update" },
  ({ ctx, input }) => retryConnectionSetup(ctx, input),
);

export async function addConnectionAction(
  orgSlug: string,
  input: AddConnectionInput,
): Promise<ActionResult<ConnectionDTO>> {
  return add(orgSlug, input);
}

export async function renameConnectionAction(
  orgSlug: string,
  input: RenameConnectionInput,
): Promise<ActionResult<ConnectionDTO>> {
  return rename(orgSlug, input);
}

export async function removeConnectionAction(
  orgSlug: string,
  input: RemoveConnectionInput,
): Promise<ActionResult<{ id: string }>> {
  return remove(orgSlug, input);
}

export async function retryConnectionAction(
  orgSlug: string,
  input: RetryConnectionInput,
): Promise<ActionResult<ConnectionDTO>> {
  return retry(orgSlug, input);
}
