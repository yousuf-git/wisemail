/** HTTP action clients — import from this file, not a barrel. */
import { admin } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const banUserAction = admin("admin.users.ban");
export const unbanUserAction = admin("admin.users.unban");
export const revokeSessionsAction = admin("admin.users.revokeSessions");
export const resendVerificationAction = admin("admin.users.resendVerification");
export const impersonateAction = admin<{ path: string }>("admin.users.impersonate");
export const changePlanActionAdmin = admin("admin.orgs.changePlan");
export const setLimitsAction = admin("admin.orgs.setLimits");
export const grantTrialAction = admin("admin.orgs.grantTrial");
export const suspendOrgAction = admin("admin.orgs.suspend");
export const unsuspendOrgAction = admin("admin.orgs.unsuspend");
export const updatePlanPriceAction = admin("admin.catalog.updatePlanPrice");
export const updatePlatformSettingsAction = admin("admin.catalog.updatePlatformSettings");
