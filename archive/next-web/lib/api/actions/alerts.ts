/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const acknowledgeIncidentAction = org("alerts.acknowledge");
export const createAlertRuleAction = org("alerts.create");
export const deleteAlertRuleAction = org("alerts.remove");
export const setAlertRuleEnabledAction = org("alerts.enable");
export const updateAlertRuleAction = org("alerts.update");
