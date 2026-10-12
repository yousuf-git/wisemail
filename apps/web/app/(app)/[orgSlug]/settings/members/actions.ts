"use server";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import type { InvitationDTO } from "@/lib/dto/member";
import type { Role } from "@/lib/auth/permissions";
import { setMemberScope } from "@/lib/services/member-scopes";
import {
  cancelInvitation,
  changeMemberRole,
  inviteMember,
  removeMember,
  resendInvitation,
} from "@/lib/services/members";
import {
  cancelInvitationSchema,
  changeMemberRoleSchema,
  inviteMemberSchema,
  removeMemberSchema,
  type CancelInvitationInput,
  type ChangeMemberRoleInput,
  type InviteMemberInput,
  type RemoveMemberInput,
} from "@/lib/validation/member";
import { setMemberScopeSchema, type SetMemberScopeInput } from "@/lib/validation/project";

const invite = orgAction(
  { input: inviteMemberSchema, permission: "invitation:create" },
  ({ ctx, input }) => inviteMember(ctx, input),
);
const cancel = orgAction(
  { input: cancelInvitationSchema, permission: "invitation:cancel" },
  ({ ctx, input }) => cancelInvitation(ctx, input),
);
const resend = orgAction(
  { input: cancelInvitationSchema, permission: "invitation:create" },
  ({ ctx, input }) => resendInvitation(ctx, input),
);
const changeRole = orgAction(
  { input: changeMemberRoleSchema, permission: "member:update" },
  ({ ctx, input }) => changeMemberRole(ctx, input),
);
const remove = orgAction(
  { input: removeMemberSchema, permission: "member:delete" },
  ({ ctx, input }) => removeMember(ctx, input),
);
const scope = orgAction(
  { input: setMemberScopeSchema, permission: "member:update" },
  ({ ctx, input }) => setMemberScope(ctx, input),
);

export async function inviteMemberAction(
  orgSlug: string,
  input: InviteMemberInput,
): Promise<ActionResult<InvitationDTO>> {
  return invite(orgSlug, input);
}

export async function cancelInvitationAction(
  orgSlug: string,
  input: CancelInvitationInput,
): Promise<ActionResult<{ id: string }>> {
  return cancel(orgSlug, input);
}

export async function resendInvitationAction(
  orgSlug: string,
  input: CancelInvitationInput,
): Promise<ActionResult<InvitationDTO>> {
  return resend(orgSlug, input);
}

export async function changeMemberRoleAction(
  orgSlug: string,
  input: ChangeMemberRoleInput,
): Promise<ActionResult<{ id: string; role: Role }>> {
  return changeRole(orgSlug, input);
}

export async function removeMemberAction(
  orgSlug: string,
  input: RemoveMemberInput,
): Promise<ActionResult<{ id: string }>> {
  return remove(orgSlug, input);
}

export async function setMemberScopeAction(
  orgSlug: string,
  input: SetMemberScopeInput,
): Promise<ActionResult<{ memberId: string; projectIds: string[] }>> {
  return scope(orgSlug, input);
}
