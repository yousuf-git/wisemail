/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const cancelInvitationAction = org("settings.members.cancel");
export const changeMemberRoleAction = org("settings.members.changeRole");
export const inviteMemberAction = org("settings.members.invite");
export const removeMemberAction = org("settings.members.remove");
export const resendInvitationAction = org("settings.members.resend");
export const setMemberScopeAction = org("settings.members.scope");
