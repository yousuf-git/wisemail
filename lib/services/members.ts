import "server-only";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import mongoose, { Types } from "mongoose";

import { authorize, type OrgContext, type UserDTO } from "@/lib/dal";
import { auth } from "@/lib/auth/server";
import { isRole, type Role } from "@/lib/auth/permissions";
import {
  PLAN_LABELS,
  getNextTier,
  getPlanLimits,
  planAllowsProjectScopes,
} from "@/lib/billing/plans";
import { connectDb } from "@/lib/db/connect";
import { MemberScopeModel } from "@/lib/db/models/member-scopes";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { env } from "@/lib/env";
import type { InvitationDTO, InvitePreview, MemberDTO, MemberQuota } from "@/lib/dto/member";
import { publish } from "@/lib/realtime/publish";
import type {
  AcceptInvitationInput,
  CancelInvitationInput,
  ChangeMemberRoleInput,
  InviteMemberInput,
  RemoveMemberInput,
} from "@/lib/validation/member";
import { inviteMemberSchema } from "@/lib/validation/member";
import { writeAuditLog } from "./audit";
import { ServiceError } from "./errors";
import { assertLiveProjects, assertScopesAllowedByPlan } from "./member-scopes";
import { clearMemberScope, roleIsScopable } from "./project-scope";

type MemberRow = {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: string;
  createdAt?: Date;
};
type InvitationRow = {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
  projectIds?: string[];
};

const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);
const userOid = (ctx: OrgContext) => new Types.ObjectId(ctx.user.id);
const rolesOf = (role: string) => role.split(",").map((r) => r.trim());
const isOwnerRole = (role: string) => rolesOf(role).includes("owner");
const primaryRole = (role: string): Role => rolesOf(role).find(isRole) ?? "viewer";

export const inviteLink = (invitationId: Types.ObjectId | string) =>
  `${env.APP_URL.replace(/\/$/, "")}/invite/${invitationId.toString()}`;

const members = () => mongoose.connection.collection<MemberRow>("member");
const invitations = () => mongoose.connection.collection<InvitationRow>("invitation");

/** Translates Better Auth failures into typed, user-facing service errors. */
function fromAuthError(error: unknown): never {
  if (error instanceof APIError) {
    const message =
      (error.body as { message?: string } | undefined)?.message ?? "We couldn't do that.";
    const status = String(error.status);
    throw new ServiceError(status === "FORBIDDEN" ? "forbidden" : "invalid_request", message);
  }
  throw error;
}

async function pendingInvitations(orgId: Types.ObjectId): Promise<InvitationRow[]> {
  return invitations()
    .find({ organizationId: orgId, status: "pending", expiresAt: { $gt: new Date() } })
    .sort({ _id: -1 })
    .toArray();
}

async function planFor(orgId: Types.ObjectId) {
  const settings = await OrgSettingsModel.findOne({ orgId }).lean();
  const plan = settings?.plan ?? "free";
  return { plan, limit: getPlanLimits(plan, settings?.limitOverrides).members };
}

export async function getMemberQuota(ctx: OrgContext): Promise<MemberQuota> {
  await connectDb();
  const orgId = orgOid(ctx);
  const { plan, limit } = await planFor(orgId);
  const next = getNextTier(plan);
  const [memberCount, pending] = await Promise.all([
    members().countDocuments({ organizationId: orgId }),
    pendingInvitations(orgId),
  ]);
  return {
    used: memberCount + pending.length,
    limit,
    planLabel: PLAN_LABELS[plan],
    nextTierLabel: next ? PLAN_LABELS[next] : null,
    scopesAllowed: planAllowsProjectScopes(plan),
  };
}

export async function listMembers(ctx: OrgContext): Promise<MemberDTO[]> {
  authorize(ctx, "member:update");
  await connectDb();
  const orgId = orgOid(ctx);
  const result = await auth.api.listMembers({
    headers: await headers(),
    query: { organizationId: ctx.org.id, limit: 500 },
  });
  const scopes = await MemberScopeModel.find({ orgId }).lean();
  const byMember = new Map(scopes.map((s) => [s.memberId.toHexString(), s.projectIds]));
  return result.members.map((m) => {
    const role = primaryRole(m.role);
    const scope = roleIsScopable(m.role) ? byMember.get(m.id) : undefined;
    return {
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image ?? null,
      role,
      joinedAt: new Date(m.createdAt).toISOString(),
      projectIds: scope ? scope.map((p) => p.toHexString()) : null,
      isYou: m.userId === ctx.user.id,
    };
  });
}

export function toInvitationDTO(row: InvitationRow): InvitationDTO {
  return {
    id: row._id.toHexString(),
    email: row.email,
    role: primaryRole(row.role),
    expiresAt: row.expiresAt.toISOString(),
    expiresInDays: Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 86_400_000)),
    link: inviteLink(row._id),
    projectIds: (row.projectIds ?? []).filter((p): p is string => typeof p === "string"),
  };
}

export async function listInvitations(ctx: OrgContext): Promise<InvitationDTO[]> {
  authorize(ctx, "invitation:create");
  await connectDb();
  return (await pendingInvitations(orgOid(ctx))).map(toInvitationDTO);
}

/**
 * Invite by email. Email delivery is not wired yet: the caller shows `link` for copying. A second
 * invite to the same address with the same role refreshes the pending invitation (new expiry).
 */
export async function inviteMember(
  ctx: OrgContext,
  rawInput: InviteMemberInput,
): Promise<InvitationDTO> {
  authorize(ctx, "invitation:create");
  await connectDb();
  const input = inviteMemberSchema.parse(rawInput);
  const orgId = orgOid(ctx);

  if (input.role === "owner" && ctx.role !== "owner") {
    throw new ServiceError("forbidden", "Only an Owner can invite another Owner.");
  }
  const scoped = input.projectIds.length > 0 && roleIsScopable(input.role);
  if (input.projectIds.length > 0 && !roleIsScopable(input.role)) {
    throw new ServiceError(
      "scope_not_allowed",
      "Owners and Admins always see everything, so they can't be limited to projects.",
    );
  }
  const projectIds = [...new Set(input.projectIds.map((i) => i.toLowerCase()))];
  if (scoped) {
    await assertScopesAllowedByPlan(orgId);
    await assertLiveProjects(
      orgId,
      projectIds.map((i) => new Types.ObjectId(i)),
    );
  }

  const existingUser = await mongoose.connection
    .collection("user")
    .findOne({ email: input.email }, { projection: { _id: 1 } });
  if (
    existingUser &&
    (await members().findOne({ organizationId: orgId, userId: existingUser._id }))
  ) {
    throw new ServiceError("conflict", "That person is already a member.", {
      email: ["That person is already a member."],
    });
  }
  const pending = await pendingInvitations(orgId);
  const existing = pending.find((p) => p.email.toLowerCase() === input.email);
  if (existing && primaryRole(existing.role) !== input.role) {
    throw new ServiceError(
      "conflict",
      `${input.email} already has a pending invitation as ${primaryRole(existing.role)}. Cancel it first to invite them with another role.`,
      { email: ["Already invited with a different role."] },
    );
  }

  if (!existing) {
    const { plan, limit } = await planFor(orgId);
    const used = (await members().countDocuments({ organizationId: orgId })) + pending.length;
    if (limit !== null && used >= limit) {
      const next = getNextTier(plan);
      throw new ServiceError(
        "plan_limit_reached",
        `You have ${limit} of ${limit} member seats used on ${PLAN_LABELS[plan]} (invitations count).` +
          (next ? ` Upgrade to ${PLAN_LABELS[next]} to invite more people.` : ""),
      );
    }
  }

  let invitationId: string;
  try {
    const created = await auth.api.createInvitation({
      headers: await headers(),
      body: {
        email: input.email,
        role: input.role,
        organizationId: ctx.org.id,
        resend: !!existing,
      },
    });
    invitationId = (created as { id: string }).id;
  } catch (error) {
    fromAuthError(error);
  }

  // Projects ride on the invitation document and are applied when it is accepted.
  await invitations().updateOne(
    { _id: new Types.ObjectId(invitationId) },
    scoped ? { $set: { projectIds } } : { $unset: { projectIds: "" } },
  );

  await writeAuditLog({
    orgId,
    actor: { type: "user", id: userOid(ctx) },
    action: "member.invited",
    target: { type: "invitation", id: invitationId },
    changes: { after: { email: input.email, role: input.role, projectIds } },
  });
  await publish({ orgId, topics: ["members"] });

  const row = await invitations().findOne({ _id: new Types.ObjectId(invitationId) });
  return toInvitationDTO(row!);
}

export async function cancelInvitation(
  ctx: OrgContext,
  input: CancelInvitationInput,
): Promise<{ id: string }> {
  authorize(ctx, "invitation:cancel");
  await connectDb();
  const orgId = orgOid(ctx);
  const row = await invitations().findOne({
    _id: new Types.ObjectId(input.invitationId),
    organizationId: orgId,
    status: "pending",
  });
  if (!row) throw new ServiceError("not_found", "We couldn't find that invitation.");
  try {
    await auth.api.cancelInvitation({
      headers: await headers(),
      body: { invitationId: input.invitationId },
    });
  } catch (error) {
    fromAuthError(error);
  }
  await writeAuditLog({
    orgId,
    actor: { type: "user", id: userOid(ctx) },
    action: "member.invitation_canceled",
    target: { type: "invitation", id: input.invitationId },
    changes: { before: { email: row.email, role: row.role } },
  });
  await publish({ orgId, topics: ["members"] });
  return { id: input.invitationId };
}

async function loadTarget(ctx: OrgContext, memberId: string) {
  const target = await members().findOne({
    _id: new Types.ObjectId(memberId),
    organizationId: orgOid(ctx),
  });
  if (!target) throw new ServiceError("not_found", "We couldn't find that member.");
  return target;
}

async function ownerCount(orgId: Types.ObjectId): Promise<number> {
  const rows = await members()
    .find({ organizationId: orgId }, { projection: { role: 1 } })
    .toArray();
  return rows.filter((r) => isOwnerRole(r.role)).length;
}

const LAST_OWNER = "A workspace needs at least one Owner. Make someone else an Owner first.";

/**
 * Change a member's role. Only Owners touch Owners; the last Owner can't be demoted. Moving
 * someone to Admin/Owner drops any project restriction (they see everything).
 */
export async function changeMemberRole(
  ctx: OrgContext,
  input: ChangeMemberRoleInput,
): Promise<{ id: string; role: Role }> {
  authorize(ctx, "member:update");
  await connectDb();
  const orgId = orgOid(ctx);
  const target = await loadTarget(ctx, input.memberId);
  const targetIsOwner = isOwnerRole(target.role);

  if ((targetIsOwner || input.role === "owner") && ctx.role !== "owner") {
    throw new ServiceError("forbidden", "Only an Owner can change Owner access.");
  }
  if (targetIsOwner && input.role !== "owner" && (await ownerCount(orgId)) <= 1) {
    throw new ServiceError("last_owner", LAST_OWNER);
  }
  const before = primaryRole(target.role);
  if (before === input.role && rolesOf(target.role).length === 1) {
    return { id: input.memberId, role: before };
  }

  try {
    await auth.api.updateMemberRole({
      headers: await headers(),
      body: { memberId: input.memberId, role: input.role, organizationId: ctx.org.id },
    });
  } catch (error) {
    fromAuthError(error);
  }
  if (!roleIsScopable(input.role)) await clearMemberScope(orgId, target._id);

  await writeAuditLog({
    orgId,
    actor: { type: "user", id: userOid(ctx) },
    action: "member.role_changed",
    target: { type: "member", id: target._id },
    changes: { before: { role: before }, after: { role: input.role } },
  });
  await publish({ orgId, userId: target.userId, topics: ["members", "access"] });
  return { id: input.memberId, role: input.role };
}

/** Removes a member (and their project scope). Only Owners remove Owners; never the last one. */
export async function removeMember(
  ctx: OrgContext,
  input: RemoveMemberInput,
): Promise<{ id: string }> {
  authorize(ctx, "member:delete");
  await connectDb();
  const orgId = orgOid(ctx);
  const target = await loadTarget(ctx, input.memberId);

  if (isOwnerRole(target.role)) {
    if (ctx.role !== "owner") {
      throw new ServiceError("forbidden", "Only an Owner can remove an Owner.");
    }
    if ((await ownerCount(orgId)) <= 1) throw new ServiceError("last_owner", LAST_OWNER);
  }
  if (target.userId.toHexString() === ctx.user.id) {
    throw new ServiceError("invalid_request", "You can't remove yourself from here.");
  }

  const user = await mongoose.connection
    .collection("user")
    .findOne({ _id: target.userId }, { projection: { email: 1 } });
  try {
    await auth.api.removeMember({
      headers: await headers(),
      body: { memberIdOrEmail: input.memberId, organizationId: ctx.org.id },
    });
  } catch (error) {
    fromAuthError(error);
  }
  await clearMemberScope(orgId, target._id);
  await writeAuditLog({
    orgId,
    actor: { type: "user", id: userOid(ctx) },
    action: "member.removed",
    target: { type: "member", id: target._id },
    changes: { before: { email: user?.email ?? null, role: primaryRole(target.role) } },
  });
  await publish({ orgId, userId: target.userId, topics: ["members", "access"] });
  return { id: input.memberId };
}

/* ------------------------------ Invitation acceptance ------------------------------ */

const maskEmail = (email: string) => {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
};

/**
 * What a visitor may learn from an invite link: the workspace name, the role, and a masked
 * address (the token alone must not reveal who was invited). `email` is only for comparing
 * with the signed-in user on the server; strip it before rendering to the client.
 */
export async function getInvitePreview(token: string): Promise<InvitePreview> {
  if (!/^[0-9a-f]{24}$/i.test(token)) return { status: "invalid" };
  await connectDb();
  const row = await invitations().findOne({ _id: new Types.ObjectId(token) });
  if (!row) return { status: "invalid" };
  const org = await mongoose.connection
    .collection("organization")
    .findOne({ _id: row.organizationId }, { projection: { name: 1 } });
  if (!org) return { status: "invalid" };
  const orgName = String(org.name);
  if (row.status !== "pending") return { status: "used", orgName };
  if (row.expiresAt.getTime() < Date.now()) return { status: "expired", orgName };
  return {
    status: "pending",
    orgName,
    role: primaryRole(row.role),
    maskedEmail: maskEmail(row.email),
    email: row.email,
  };
}

/**
 * Accepts an invitation as the signed-in user via Better Auth (recipient email must match, the
 * plan's member limit applies, the invitation's projects are applied by an auth hook). Returns
 * the org slug to redirect to.
 */
export async function acceptInvitation(
  user: UserDTO,
  input: AcceptInvitationInput,
): Promise<{ orgSlug: string; orgId: string }> {
  await connectDb();
  const preview = await getInvitePreview(input.invitationId);
  if (preview.status === "invalid") {
    throw new ServiceError("not_found", "This invitation link isn't valid.");
  }
  if (preview.status === "expired") {
    throw new ServiceError("invitation_expired", "This invitation expired. Ask for a new one.");
  }
  if (preview.status !== "pending") {
    throw new ServiceError("invitation_used", "This invitation was already used or canceled.");
  }
  if (preview.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new ServiceError(
      "wrong_recipient",
      `This invitation was sent to ${preview.maskedEmail}. Sign in with that address to accept it.`,
    );
  }
  let organizationId: string;
  try {
    const res = await auth.api.acceptInvitation({
      headers: await headers(),
      body: { invitationId: input.invitationId },
    });
    organizationId = (res as { invitation: { organizationId: string } }).invitation.organizationId;
  } catch (error) {
    fromAuthError(error);
  }
  const org = await mongoose.connection
    .collection("organization")
    .findOne({ _id: new Types.ObjectId(organizationId) }, { projection: { slug: 1 } });
  const orgId = new Types.ObjectId(organizationId);
  await writeAuditLog({
    orgId,
    actor: { type: "user", id: new Types.ObjectId(user.id) },
    action: "member.joined",
    target: { type: "invitation", id: input.invitationId },
    changes: { after: { role: preview.role } },
  });
  await publish({ orgId, topics: ["members"] });
  return { orgSlug: String(org!.slug), orgId: organizationId };
}
