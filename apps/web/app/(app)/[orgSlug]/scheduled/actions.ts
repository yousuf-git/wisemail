"use server";

import { z } from "zod";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import { cancelScheduledEmail, rescheduleEmail } from "@/lib/services/sending";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");
const cancelInput = z.object({ emailId: objectId });
const rescheduleInput = z.object({ emailId: objectId, scheduledAt: z.coerce.date() });

const cancel = orgAction({ input: cancelInput, permission: "email:send" }, ({ ctx, input }) =>
  cancelScheduledEmail(ctx, input.emailId),
);
const reschedule = orgAction(
  { input: rescheduleInput, permission: "email:send" },
  ({ ctx, input }) => rescheduleEmail(ctx, input),
);

export async function cancelScheduledAction(
  orgSlug: string,
  input: z.input<typeof cancelInput>,
): Promise<ActionResult<{ emailId: string; status: "canceled" }>> {
  return cancel(orgSlug, input);
}

/** `scheduledAt` is an ISO string from the browser (its local time, converted). */
export async function rescheduleAction(
  orgSlug: string,
  input: z.input<typeof rescheduleInput>,
): Promise<ActionResult<{ emailId: string; scheduledAt: string }>> {
  return reschedule(orgSlug, input);
}
