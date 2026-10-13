/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const requestDeletionAction = org("settings.general.requestDeletion");
export const updateGeneralAction = org("settings.general.update");
