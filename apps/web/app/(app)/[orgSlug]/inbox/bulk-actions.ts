"use server";

import { z } from "zod";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import { getBulkOperation, countMatching, startBulkOperation } from "@/lib/deletion/bulk";
import { bulkFilterSchema } from "@/lib/deletion/filters";
import { countTrash, emptyTrash, permanentlyDeleteItems } from "@/lib/deletion/trash";
import type { BulkOperationDTO, PermanentDeleteResultDTO } from "@/lib/dto/deletion";

/**
 * Permanent delete, Empty trash and bulk operations (TRD §2.14). Permissions are enforced in the
 * services: `email:delete` (Owner/Admin) for anything permanent, the member's trash access for
 * moving to Trash and restoring.
 */

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");

const deleteInput = z
  .object({
    threadIds: z.array(objectId).max(100).optional(),
    emailIds: z.array(objectId).max(100).optional(),
  })
  .refine((v) => (v.threadIds?.length ?? 0) + (v.emailIds?.length ?? 0) > 0, "Nothing selected");
const emptyInput = z.object({ confirmCount: z.number().int().min(0).optional() });
const countInput = z.object({ filter: bulkFilterSchema });
const startInput = z.object({
  action: z.enum(["trash", "delete", "restore"]),
  filter: bulkFilterSchema,
  confirmCount: z.number().int().min(0).optional(),
});
const opInput = z.object({ opId: objectId });

const del = orgAction({ input: deleteInput }, ({ ctx, input }) =>
  permanentlyDeleteItems(ctx, input),
);
const empty = orgAction({ input: emptyInput }, ({ ctx, input }) => emptyTrash(ctx, input));
const trashCount = orgAction({ input: z.object({}) }, ({ ctx }) => countTrash(ctx));
const count = orgAction({ input: countInput }, ({ ctx, input }) =>
  countMatching(ctx, input.filter),
);
const start = orgAction({ input: startInput }, ({ ctx, input }) => startBulkOperation(ctx, input));
const progress = orgAction({ input: opInput }, ({ ctx, input }) =>
  getBulkOperation(ctx, input.opId),
);

export async function permanentlyDeleteAction(
  orgSlug: string,
  input: z.input<typeof deleteInput>,
): Promise<ActionResult<PermanentDeleteResultDTO>> {
  return del(orgSlug, input);
}

export async function emptyTrashAction(
  orgSlug: string,
  input: z.input<typeof emptyInput> = {},
): Promise<ActionResult<Awaited<ReturnType<typeof emptyTrash>>>> {
  return empty(orgSlug, input);
}

export async function countTrashAction(orgSlug: string): Promise<ActionResult<number>> {
  return trashCount(orgSlug, {});
}

export async function countMatchingAction(
  orgSlug: string,
  input: z.input<typeof countInput>,
): Promise<ActionResult<number>> {
  return count(orgSlug, input);
}

export async function startBulkAction(
  orgSlug: string,
  input: z.input<typeof startInput>,
): Promise<ActionResult<BulkOperationDTO>> {
  return start(orgSlug, input);
}

export async function getBulkOperationAction(
  orgSlug: string,
  input: z.input<typeof opInput>,
): Promise<ActionResult<BulkOperationDTO>> {
  return progress(orgSlug, input);
}
