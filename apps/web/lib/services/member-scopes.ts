import "server-only";

import mongoose, { Types } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { assertFeature } from "@/lib/billing/entitlements";
import { connectDb } from "@/lib/db/connect";
import { assertRefs, RefError } from "@/lib/db/refs";
import { MemberScopeModel } from "@/lib/db/models/member-scopes";
import { ProjectModel } from "@/lib/db/models/projects";
import { withTransaction } from "@/lib/db/transaction";
import { publish } from "@/lib/realtime/publish";
import type { SetMemberScopeInput } from "@/lib/validation/project";
import { writeAuditLog } from "./audit";
import { ServiceError } from "./errors";
import { roleIsScopable } from "./project-scope";

type MemberDoc = {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: string;
};

/** Throws unless the org's plan includes project-scoped members (PRICING §3: Team and above). */
export async function assertScopesAllowedByPlan(orgId: Types.ObjectId): Promise<void> {
  await assertFeature(orgId, "projectScopedMembers");
}

/** Every project id must be a live project of this org (`assertRefs` + soft-delete check). */
export async function assertLiveProjects(
  orgId: Types.ObjectId,
  ids: Types.ObjectId[],
  session?: import("mongoose").ClientSession,
): Promise<void> {
  await assertRefs(orgId, [{ model: ProjectModel, ids }], { session });
  const unique = new Set(ids.map((i) => i.toHexString()));
  const liveCount = await ProjectModel.countDocuments(
    { _id: { $in: [...unique].map((i) => new Types.ObjectId(i)) }, orgId, deletedAt: null },
    { session },
  );
  if (liveCount !== unique.size) {
    throw new RefError([{ model: ProjectModel.modelName, id: "deleted" }]);
  }
}

/** memberId -> project ids for every restricted member of the org. */
export async function listMemberScopes(ctx: OrgContext): Promise<Map<string, string[]>> {
  authorize(ctx, "member:update");
  await connectDb();
  const docs = await MemberScopeModel.find({ orgId: new Types.ObjectId(ctx.org.id) }).lean();
  return new Map(
    docs.map((d) => [d.memberId.toHexString(), d.projectIds.map((p) => p.toHexString())]),
  );
}

/**
 * Restricts a member to `projectIds` (an empty list clears the restriction). Owners and admins
 * cannot be scoped; scopes need a plan that includes them; every project must exist in the same
 * org. A scope is never stored empty.
 */
export async function setMemberScope(
  ctx: OrgContext,
  input: SetMemberScopeInput,
): Promise<{ memberId: string; projectIds: string[] }> {
  authorize(ctx, "member:update");
  await connectDb();
  const orgId = new Types.ObjectId(ctx.org.id);
  const memberId = new Types.ObjectId(input.memberId);
  const ids = [...new Set(input.projectIds.map((i) => i.toLowerCase()))].map(
    (i) => new Types.ObjectId(i),
  );

  const member = await mongoose.connection
    .collection<MemberDoc>("member")
    .findOne({ _id: memberId, organizationId: orgId });
  if (!member) throw new ServiceError("not_found", "We couldn't find that member.");
  if (ids.length > 0) {
    if (!roleIsScopable(member.role)) {
      throw new ServiceError(
        "scope_not_allowed",
        "Owners and Admins always see everything, so they can't be limited to projects.",
      );
    }
    await assertScopesAllowedByPlan(orgId);
  }

  return withTransaction(async (session) => {
    if (ids.length > 0) await assertLiveProjects(orgId, ids, session);
    const before = await MemberScopeModel.findOne({ orgId, memberId }, null, { session }).lean();
    if (ids.length === 0) {
      await MemberScopeModel.deleteOne({ orgId, memberId }, { session });
    } else {
      await MemberScopeModel.updateOne(
        { orgId, memberId },
        { $set: { projectIds: ids }, $setOnInsert: { orgId, memberId } },
        { upsert: true, session },
      );
    }
    await writeAuditLog(
      {
        orgId,
        actor: { type: "user", id: new Types.ObjectId(ctx.user.id) },
        action: "member.scope_changed",
        target: { type: "member", id: memberId },
        changes: {
          before: { projectIds: before?.projectIds.map((p) => p.toHexString()) ?? [] },
          after: { projectIds: ids.map((p) => p.toHexString()) },
        },
      },
      { session },
    );
    // The affected member's live streams re-check access (UCD §5).
    await publish({ orgId, userId: member.userId, topics: ["members", "access"] }, { session });
    return { memberId: memberId.toHexString(), projectIds: ids.map((p) => p.toHexString()) };
  });
}
