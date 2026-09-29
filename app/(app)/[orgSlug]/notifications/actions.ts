"use server";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import { markAllNotificationsRead, markNotificationsRead } from "@/lib/services/notifications";
import { markReadSchema } from "@/lib/validation/alert";
import { z } from "zod";

const markRead = orgAction({ input: markReadSchema }, ({ ctx, input }) =>
  markNotificationsRead(ctx, input.ids),
);
const markAll = orgAction({ input: z.object({}) }, ({ ctx }) => markAllNotificationsRead(ctx));

export async function markNotificationsReadAction(
  orgSlug: string,
  ids: string[],
): Promise<ActionResult<{ updated: number; unreadCount: number }>> {
  return markRead(orgSlug, { ids });
}

export async function markAllNotificationsReadAction(
  orgSlug: string,
): Promise<ActionResult<{ updated: number; unreadCount: number }>> {
  return markAll(orgSlug, {});
}
