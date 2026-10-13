/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const buyCreditPackAction = org("settings.billing.pack");
export const cancelPendingChangeAction = org("settings.billing.cancel");
export const changePlanAction = org("settings.billing.change");
export const openPortalAction = org("settings.billing.portal");
export const previewPlanChangeAction = org("settings.billing.preview");
export const startCheckoutAction = org("settings.billing.checkout");
export const startTrialAction = org("settings.billing.trial");
