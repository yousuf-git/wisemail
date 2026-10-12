"use server";

import { z } from "zod";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import type { SenderDTO } from "@/lib/dto/mail";
import {
  createSender,
  deleteSender,
  setSenderDisabled,
  updateSender,
} from "@/lib/services/senders";
import {
  createSenderInput,
  updateSenderInput,
  type CreateSenderInput,
  type UpdateSenderInput,
} from "@/lib/validation/mail";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");

const create = orgAction(
  { input: createSenderInput, permission: "sender:create" },
  ({ ctx, input }) => createSender(ctx, input),
);
const update = orgAction(
  { input: updateSenderInput, permission: "sender:update" },
  ({ ctx, input }) => updateSender(ctx, input),
);
const disable = orgAction(
  { input: z.object({ id: objectId, disabled: z.boolean() }), permission: "sender:update" },
  ({ ctx, input }) => setSenderDisabled(ctx, input),
);
const remove = orgAction(
  { input: z.object({ id: objectId }), permission: "sender:delete" },
  async ({ ctx, input }) => {
    await deleteSender(ctx, input.id);
    return { id: input.id };
  },
);

export async function createSenderAction(
  orgSlug: string,
  input: CreateSenderInput,
): Promise<ActionResult<SenderDTO>> {
  return create(orgSlug, input);
}

export async function updateSenderAction(
  orgSlug: string,
  input: UpdateSenderInput,
): Promise<ActionResult<SenderDTO>> {
  return update(orgSlug, input);
}

export async function setSenderDisabledAction(
  orgSlug: string,
  input: { id: string; disabled: boolean },
): Promise<ActionResult<SenderDTO>> {
  return disable(orgSlug, input);
}

export async function deleteSenderAction(
  orgSlug: string,
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  return remove(orgSlug, input);
}
