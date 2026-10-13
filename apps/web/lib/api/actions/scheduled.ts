/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const cancelScheduledAction = org("scheduled.cancel");
export const rescheduleAction = org("scheduled.reschedule");
