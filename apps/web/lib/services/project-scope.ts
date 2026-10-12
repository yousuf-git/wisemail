import mongoose, { Types, type ClientSession } from "mongoose";

import { connectDb } from "@/lib/db/connect";
import { MemberScopeModel } from "@/lib/db/models/member-scopes";
import { isRole } from "@/lib/auth/permissions";

/**
 * Project-scope primitives with no dependency on the DAL or Better Auth, so both can import
 * them (the DAL loads the scope into `OrgContext`; auth hooks apply scopes on accept/remove).
 */

/** Owners and admins always see the whole organization; a stale scope document is ignored. */
export const UNSCOPABLE_ROLES = ["owner", "admin"] as const;

export function roleIsScopable(role: string): boolean {
  const roles = role
    .split(",")
    .map((r) => r.trim())
    .filter(isRole);
  return (
    roles.length > 0 && !roles.some((r) => (UNSCOPABLE_ROLES as readonly string[]).includes(r))
  );
}

/**
 * The projects a member is restricted to, or `null` for unrestricted access. Unrestricted:
 * owners/admins, and members without a `member_scopes` document.
 */
export async function loadProjectScope(input: {
  orgId: string;
  memberId: string;
  role: string;
}): Promise<string[] | null> {
  if (!roleIsScopable(input.role)) return null;
  await connectDb();
  const doc = await MemberScopeModel.findOne(
    { orgId: new Types.ObjectId(input.orgId), memberId: new Types.ObjectId(input.memberId) },
    { projectIds: 1 },
  ).lean();
  if (!doc || doc.projectIds.length === 0) return null;
  return doc.projectIds.map((id) => id.toHexString());
}

/**
 * Tenant filter fragment for project-scoped reads (TRD §7): `{}` for unrestricted members,
 * else `{ projectId: { $in: allowed } }`. Spread it next to `orgId` in every query over
 * collections that carry `projectId`.
 */
export function projectFilter(ctx: { projectScope: string[] | null }): {
  projectId?: { $in: Types.ObjectId[] };
} {
  if (ctx.projectScope === null) return {};
  return { projectId: { $in: ctx.projectScope.map((id) => new Types.ObjectId(id)) } };
}

/** True if the member may see data belonging to `projectId` (null = not in any project). */
export function canSeeProject(
  ctx: { projectScope: string[] | null },
  projectId: string | null | undefined,
): boolean {
  if (ctx.projectScope === null) return true;
  return !!projectId && ctx.projectScope.includes(projectId);
}

export async function clearMemberScope(
  orgId: Types.ObjectId,
  memberId: Types.ObjectId,
  options: { session?: ClientSession } = {},
) {
  await MemberScopeModel.deleteOne({ orgId, memberId }, { session: options.session });
}

/**
 * Applies the projects stored on an invitation to the member created by accepting it. Best
 * effort by design: invalid or deleted projects are dropped, and the scope is only applied to
 * roles that can be scoped.
 */
export async function applyInvitationScope(input: {
  invitationId: string;
  orgId: string;
  memberId: string;
  role: string;
}): Promise<void> {
  if (!roleIsScopable(input.role)) return;
  await connectDb();
  const invitation = await mongoose.connection
    .collection("invitation")
    .findOne({ _id: new Types.ObjectId(input.invitationId) });
  const raw = (invitation?.projectIds ?? []) as unknown[];
  const ids = raw.filter((v): v is string => typeof v === "string" && /^[0-9a-f]{24}$/i.test(v));
  if (ids.length === 0) return;
  const orgId = new Types.ObjectId(input.orgId);
  const live = await mongoose.connection
    .collection("projects")
    .find({ _id: { $in: ids.map((i) => new Types.ObjectId(i)) }, orgId, deletedAt: null })
    .project({ _id: 1 })
    .toArray();
  if (live.length === 0) return;
  await MemberScopeModel.updateOne(
    { orgId, memberId: new Types.ObjectId(input.memberId) },
    { $set: { projectIds: live.map((p) => p._id) } },
    { upsert: true },
  );
}
