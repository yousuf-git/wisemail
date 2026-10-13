/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const markAllNotificationsReadAction = org("notifications.markAll");
export const markNotificationsReadAction = org("notifications.markRead");
