/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const createCleanupRuleAction = org("settings.cleanup.create");
export const deleteCleanupRuleAction = org("settings.cleanup.remove");
export const previewCleanupRuleAction = org("settings.cleanup.preview");
export const setCleanupRuleEnabledAction = org("settings.cleanup.toggle");
export const updateCleanupRuleAction = org("settings.cleanup.update");
