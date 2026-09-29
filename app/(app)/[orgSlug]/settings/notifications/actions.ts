"use server";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import type { NotificationPreferencesDTO } from "@/lib/dto/notification";
import { updateNotificationPreferences } from "@/lib/services/notifications";
import {
  notificationPreferencesSchema,
  type NotificationPreferencesInput,
} from "@/lib/validation/alert";

const update = orgAction({ input: notificationPreferencesSchema }, ({ ctx, input }) =>
  updateNotificationPreferences(ctx, input),
);

export async function updateNotificationPreferencesAction(
  orgSlug: string,
  input: NotificationPreferencesInput,
): Promise<ActionResult<NotificationPreferencesDTO>> {
  return update(orgSlug, input);
}
