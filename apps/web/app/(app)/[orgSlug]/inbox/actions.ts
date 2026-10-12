"use server";

import { z } from "zod";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import { retryInboundFetch } from "@/lib/services/emails";
import { markThreadRead, markThreadUnread, restoreItems, trashItems } from "@/lib/services/threads";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");
const threadInput = z.object({ threadId: objectId });
const itemsInput = z
  .object({
    threadIds: z.array(objectId).max(100).optional(),
    emailIds: z.array(objectId).max(100).optional(),
  })
  .refine((v) => (v.threadIds?.length ?? 0) + (v.emailIds?.length ?? 0) > 0, "Nothing selected");
const emailInput = z.object({ emailId: objectId });

const read = orgAction({ input: threadInput, permission: "thread:read" }, ({ ctx, input }) =>
  markThreadRead(ctx, input.threadId),
);
const unread = orgAction({ input: threadInput, permission: "thread:read" }, ({ ctx, input }) =>
  markThreadUnread(ctx, input.threadId),
);
const trash = orgAction({ input: itemsInput }, ({ ctx, input }) => trashItems(ctx, input));
const restore = orgAction({ input: itemsInput }, ({ ctx, input }) => restoreItems(ctx, input));
const retry = orgAction(
  { input: emailInput, permission: "thread:read" },
  async ({ ctx, input }) => {
    await retryInboundFetch(ctx, input.emailId);
    return { emailId: input.emailId };
  },
);

type Counts = { threads: number; emails: number };
type ReadState = { threadId: string; unread: boolean };

export async function markThreadReadAction(
  orgSlug: string,
  input: z.input<typeof threadInput>,
): Promise<ActionResult<ReadState>> {
  return read(orgSlug, input);
}

export async function markThreadUnreadAction(
  orgSlug: string,
  input: z.input<typeof threadInput>,
): Promise<ActionResult<ReadState>> {
  return unread(orgSlug, input);
}

export async function trashItemsAction(
  orgSlug: string,
  input: z.input<typeof itemsInput>,
): Promise<ActionResult<Counts>> {
  return trash(orgSlug, input);
}

export async function restoreItemsAction(
  orgSlug: string,
  input: z.input<typeof itemsInput>,
): Promise<ActionResult<Counts>> {
  return restore(orgSlug, input);
}

export async function retryInboundAction(
  orgSlug: string,
  input: z.input<typeof emailInput>,
): Promise<ActionResult<{ emailId: string }>> {
  return retry(orgSlug, input);
}
