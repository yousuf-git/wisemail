"use server";

import { z } from "zod";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import type { BroadcastAudienceDTO, BroadcastDTO } from "@/lib/dto/audience";
import {
  cancelBroadcast,
  createBroadcast,
  deleteBroadcast,
  getBroadcastAudience,
  refreshBroadcast,
  sendBroadcast,
  sendBroadcastTest,
  updateBroadcast,
} from "@/lib/services/broadcasts";
import {
  createBroadcastInput,
  objectId,
  sendBroadcastInput,
  sendBroadcastTestInput,
  updateBroadcastInput,
  type CreateBroadcastInput,
  type UpdateBroadcastInput,
} from "@/lib/validation/audience";

const idInput = z.object({ id: objectId });

const create = orgAction(
  { input: createBroadcastInput, permission: "broadcast:create" },
  ({ ctx, input }) => createBroadcast(ctx, input),
);
const update = orgAction(
  { input: updateBroadcastInput, permission: "broadcast:create" },
  ({ ctx, input }) => updateBroadcast(ctx, input),
);
const send = orgAction(
  { input: sendBroadcastInput, permission: "broadcast:send" },
  ({ ctx, input }) => sendBroadcast(ctx, input),
);
const cancel = orgAction({ input: idInput, permission: "broadcast:send" }, ({ ctx, input }) =>
  cancelBroadcast(ctx, input.id),
);
const remove = orgAction({ input: idInput, permission: "broadcast:read" }, ({ ctx, input }) =>
  deleteBroadcast(ctx, input.id),
);
const test = orgAction(
  { input: sendBroadcastTestInput, permission: "broadcast:send" },
  ({ ctx, input }) => sendBroadcastTest(ctx, input),
);
const audience = orgAction({ input: idInput, permission: "broadcast:read" }, ({ ctx, input }) =>
  getBroadcastAudience(ctx, input.id),
);
const refresh = orgAction({ input: idInput, permission: "broadcast:read" }, ({ ctx, input }) =>
  refreshBroadcast(ctx, input.id),
);

export async function createBroadcastAction(
  orgSlug: string,
  input: CreateBroadcastInput,
): Promise<ActionResult<BroadcastDTO>> {
  return create(orgSlug, input);
}
export async function updateBroadcastAction(
  orgSlug: string,
  input: UpdateBroadcastInput,
): Promise<ActionResult<BroadcastDTO>> {
  return update(orgSlug, input);
}
export async function sendBroadcastAction(
  orgSlug: string,
  input: { id: string; scheduledAt?: string },
): Promise<ActionResult<BroadcastDTO>> {
  return send(orgSlug, input);
}
export async function cancelBroadcastAction(
  orgSlug: string,
  input: { id: string },
): Promise<ActionResult<BroadcastDTO>> {
  return cancel(orgSlug, input);
}
export async function deleteBroadcastAction(
  orgSlug: string,
  input: { id: string },
): Promise<ActionResult<{ removedInResend: boolean }>> {
  return remove(orgSlug, input);
}
export async function sendBroadcastTestAction(
  orgSlug: string,
  input: { id: string; to?: string },
): Promise<ActionResult<{ to: string }>> {
  return test(orgSlug, input);
}
export async function getBroadcastAudienceAction(
  orgSlug: string,
  input: { id: string },
): Promise<ActionResult<BroadcastAudienceDTO>> {
  return audience(orgSlug, input);
}
export async function refreshBroadcastAction(
  orgSlug: string,
  input: { id: string },
): Promise<ActionResult<BroadcastDTO>> {
  return refresh(orgSlug, input);
}
