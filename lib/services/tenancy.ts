import mongoose, { Types } from "mongoose";

import { connectDb } from "@/lib/db/connect";
import { isRole, type Role } from "@/lib/auth/permissions";

/**
 * Read-side tenancy lookups over Better Auth's `organization` and `member` collections.
 * Pure of request state: callers pass the verified `userId`. Never accepts an orgId from input;
 * the org is resolved from the slug and membership is checked against the verified user.
 */
export type OrgRef = { id: string; name: string; slug: string };
export type OrgAccess = { org: OrgRef; role: Role; memberId: string };

type OrgDoc = { _id: Types.ObjectId; name: string; slug: string };
type MemberDoc = { _id: Types.ObjectId; organizationId: Types.ObjectId; role: string };

const toRef = (o: OrgDoc): OrgRef => ({ id: o._id.toHexString(), name: o.name, slug: o.slug });

function asObjectId(value: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(value) && /^[0-9a-f]{24}$/i.test(value)
    ? new Types.ObjectId(value)
    : null;
}

/** The user's access to the org with this slug, or null if the org does not exist or they are not a member. */
export async function resolveOrgAccess(userId: string, orgSlug: string): Promise<OrgAccess | null> {
  const uid = asObjectId(userId);
  if (!uid || typeof orgSlug !== "string" || orgSlug.length > 64) return null;
  await connectDb();
  const db = mongoose.connection;

  const org = await db.collection<OrgDoc>("organization").findOne({ slug: orgSlug });
  if (!org) return null;
  const member = await db
    .collection<MemberDoc>("member")
    .findOne({ organizationId: org._id, userId: uid } as never);
  if (!member) return null;

  // The member role may be comma-separated; pick the first known role for display.
  const role = member.role
    .split(",")
    .map((r) => r.trim())
    .find(isRole);
  if (!role) return null;
  return { org: toRef(org), role, memberId: member._id.toHexString() };
}

/** Every org the user belongs to, oldest membership first. */
export async function listUserOrgs(userId: string): Promise<OrgRef[]> {
  const uid = asObjectId(userId);
  if (!uid) return [];
  await connectDb();
  const db = mongoose.connection;

  const members = await db
    .collection<MemberDoc>("member")
    .find({ userId: uid } as never)
    .sort({ _id: 1 })
    .toArray();
  if (members.length === 0) return [];
  const orgs = await db
    .collection<OrgDoc>("organization")
    .find({ _id: { $in: members.map((m) => m.organizationId) } })
    .toArray();
  const byId = new Map(orgs.map((o) => [o._id.toHexString(), o]));
  return members
    .map((m) => byId.get(m.organizationId.toHexString()))
    .filter((o): o is OrgDoc => !!o)
    .map(toRef);
}

export async function isSlugTaken(slug: string): Promise<boolean> {
  await connectDb();
  return !!(await mongoose.connection
    .collection("organization")
    .findOne({ slug }, { projection: { _id: 1 } }));
}
