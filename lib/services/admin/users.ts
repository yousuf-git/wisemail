import "server-only";

import { headers } from "next/headers";
import mongoose, { Types } from "mongoose";

import { hasAdminRole } from "@/lib/admin/allowlist";
import type { AdminActor } from "@/lib/admin/guard";
import { auth } from "@/lib/auth/server";
import { connectDb } from "@/lib/db/connect";
import type { AdminPageDTO, AdminUserDetailDTO, AdminUserRowDTO } from "@/lib/dto/admin";
import { ServiceError } from "@/lib/services/errors";
import { listUserOrgs } from "@/lib/services/tenancy";
import { writeAdminAudit } from "./audit";
import { DEFAULT_PAGE, decodeCursor, escapeRegex, iso, requireOid } from "./shared";

type UserDoc = {
  _id: Types.ObjectId;
  name?: string;
  email: string;
  emailVerified?: boolean;
  image?: string | null;
  role?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
  createdAt?: Date;
};

const users = () => mongoose.connection.collection<UserDoc>("user");

const asIdOrString = (id: Types.ObjectId) => ({ $in: [id, id.toHexString()] });

function toRow(u: UserDoc, orgCount: number): AdminUserRowDTO {
  const role = u.role ?? "user";
  return {
    id: u._id.toHexString(),
    name: u.name ?? "",
    email: u.email,
    emailVerified: !!u.emailVerified,
    role,
    isAdmin: hasAdminRole(role),
    banned: isBanned(u),
    createdAt: (u.createdAt ?? u._id.getTimestamp()).toISOString(),
    orgCount,
  };
}

function isBanned(u: Pick<UserDoc, "banned" | "banExpires">) {
  if (!u.banned) return false;
  return !u.banExpires || new Date(u.banExpires).getTime() > Date.now();
}

async function orgCounts(ids: Types.ObjectId[]) {
  if (ids.length === 0) return new Map<string, number>();
  const rows = await mongoose.connection
    .collection("member")
    .aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { userId: { $in: ids } } },
      { $group: { _id: "$userId", n: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

async function rowsFor(docs: UserDoc[]) {
  const counts = await orgCounts(docs.map((d) => d._id));
  return docs.map((d) => toRow(d, counts.get(d._id.toHexString()) ?? 0));
}

/** Newest first, optional search over name and email, keyset pagination on `_id`. */
export async function listUsers(
  options: { q?: string; cursor?: string | null; limit?: number } = {},
): Promise<AdminPageDTO<AdminUserRowDTO>> {
  await connectDb();
  const limit = Math.min(options.limit ?? DEFAULT_PAGE, 100);
  const filter: Record<string, unknown> = {};
  const q = options.q?.trim();
  if (q) {
    const rx = { $regex: escapeRegex(q.slice(0, 80)), $options: "i" };
    filter.$or = [{ email: rx }, { name: rx }];
  }
  const cursor = decodeCursor(options.cursor);
  if (cursor) filter._id = { $lt: cursor };
  const docs = await users()
    .find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .toArray();
  const page = docs.slice(0, limit);
  return {
    items: await rowsFor(page),
    nextCursor: docs.length > limit ? page[page.length - 1]!._id.toHexString() : null,
  };
}

export async function getRecentSignups(limit = 6): Promise<AdminUserRowDTO[]> {
  return (await listUsers({ limit })).items;
}

export async function getUserDetail(userId: string): Promise<AdminUserDetailDTO | null> {
  await connectDb();
  const id = requireOidOrNull(userId);
  if (!id) return null;
  const u = await users().findOne({ _id: id });
  if (!u) return null;
  const db = mongoose.connection;
  const [members, accounts, sessions] = await Promise.all([
    db
      .collection("member")
      .find({ userId: asIdOrString(id) } as never)
      .sort({ _id: 1 })
      .toArray(),
    db
      .collection("account")
      .find({ userId: asIdOrString(id) } as never, { projection: { providerId: 1 } })
      .toArray(),
    db
      .collection("session")
      .find({ userId: asIdOrString(id) } as never, {
        projection: { expiresAt: 1, createdAt: 1, updatedAt: 1, impersonatedBy: 1 },
      })
      .toArray(),
  ]);
  const orgs = await db
    .collection("organization")
    .find({ _id: { $in: members.map((m) => m.organizationId) } })
    .toArray();
  const orgById = new Map(orgs.map((o) => [String(o._id), o]));
  const real = sessions.filter((s) => !s.impersonatedBy);
  const now = Date.now();
  const latest = (field: "createdAt" | "updatedAt") =>
    real.reduce<Date | null>((acc, s) => {
      const d = s[field] ? new Date(s[field] as Date) : null;
      return d && (!acc || d > acc) ? d : acc;
    }, null);
  const [row] = await rowsFor([u]);
  return {
    ...row!,
    banReason: u.banReason ?? null,
    banExpires: iso(u.banExpires),
    image: u.image ?? null,
    providers: [...new Set(accounts.map((a) => String(a.providerId)))],
    memberships: members
      .map((m) => {
        const org = orgById.get(String(m.organizationId));
        if (!org) return null;
        return {
          orgId: String(org._id),
          orgName: org.name as string,
          orgSlug: org.slug as string,
          role: String(m.role),
          joinedAt: (m.createdAt
            ? new Date(m.createdAt as Date)
            : (m._id as Types.ObjectId).getTimestamp()
          ).toISOString(),
        };
      })
      .filter((m): m is NonNullable<typeof m> => !!m),
    sessions: {
      active: real.filter((s) => new Date(s.expiresAt as Date).getTime() > now).length,
      lastSeenAt: iso(latest("updatedAt")),
      lastCreatedAt: iso(latest("createdAt")),
    },
  };
}

const requireOidOrNull = (value: string) =>
  /^[0-9a-f]{24}$/i.test(value) ? new Types.ObjectId(value) : null;

async function loadTarget(userId: string): Promise<UserDoc> {
  await connectDb();
  const id = requireOid(userId, "user");
  const target = await users().findOne({ _id: id });
  if (!target) throw new ServiceError("not_found", "We couldn't find that user.");
  return target;
}

function assertNotSelf(admin: AdminActor, target: UserDoc, verb: string) {
  if (target._id.toHexString() === admin.id) {
    throw new ServiceError("validation", `You can't ${verb} your own account.`);
  }
}

function assertNotAdmin(target: UserDoc, verb: string) {
  if (hasAdminRole(target.role)) {
    throw new ServiceError("forbidden", `Platform admins can't be ${verb}.`);
  }
}

export async function banUser(
  admin: AdminActor,
  input: { userId: string; reason: string; expiresInDays?: number | null },
) {
  const target = await loadTarget(input.userId);
  assertNotSelf(admin, target, "ban");
  assertNotAdmin(target, "banned");
  // The plugin checks the caller's role again and revokes the user's sessions.
  await auth.api.banUser({
    headers: await headers(),
    body: {
      userId: input.userId,
      banReason: input.reason,
      ...(input.expiresInDays ? { banExpiresIn: input.expiresInDays * 86_400 } : {}),
    },
  });
  await writeAdminAudit({
    admin,
    action: "admin.user_banned",
    target: { type: "user", id: target._id },
    reason: input.reason,
    changes: {
      before: { banned: false },
      after: { banned: true, email: target.email, expiresInDays: input.expiresInDays ?? null },
    },
  });
}

export async function unbanUser(admin: AdminActor, input: { userId: string; reason?: string }) {
  const target = await loadTarget(input.userId);
  await auth.api.unbanUser({ headers: await headers(), body: { userId: input.userId } });
  await writeAdminAudit({
    admin,
    action: "admin.user_unbanned",
    target: { type: "user", id: target._id },
    reason: input.reason,
    changes: { before: { banned: true }, after: { banned: false, email: target.email } },
  });
}

export async function revokeUserSessions(
  admin: AdminActor,
  input: { userId: string; reason: string },
) {
  const target = await loadTarget(input.userId);
  assertNotSelf(admin, target, "sign out");
  assertNotAdmin(target, "signed out here");
  await auth.api.revokeUserSessions({ headers: await headers(), body: { userId: input.userId } });
  await writeAdminAudit({
    admin,
    action: "admin.sessions_revoked",
    target: { type: "user", id: target._id },
    reason: input.reason,
    changes: { after: { email: target.email } },
  });
}

export async function resendVerification(admin: AdminActor, input: { userId: string }) {
  const target = await loadTarget(input.userId);
  if (target.emailVerified) {
    throw new ServiceError("conflict", "This address is already verified.");
  }
  await auth.api.sendVerificationEmail({ body: { email: target.email } });
  await writeAdminAudit({
    admin,
    action: "admin.verification_resent",
    target: { type: "user", id: target._id },
    changes: { after: { email: target.email } },
  });
}

/* ------------------------------------------------------------------------------------------ */
/* Impersonation                                                                               */
/* ------------------------------------------------------------------------------------------ */

/**
 * Support impersonation via Better Auth. The plugin swaps the session cookie for a one-hour
 * session of the target (`session.impersonatedBy` = the admin) and keeps the admin's own session
 * in `admin_session`. Admins cannot impersonate admins (the plugin denies it; checked here too).
 * The start is recorded under the platform scope and under every workspace the user belongs to.
 * Returns where to send the browser.
 */
export async function startImpersonation(
  admin: AdminActor,
  input: { userId: string; reason: string },
): Promise<{ path: string }> {
  const target = await loadTarget(input.userId);
  assertNotSelf(admin, target, "impersonate");
  assertNotAdmin(target, "impersonated");
  if (isBanned(target)) throw new ServiceError("conflict", "This user is banned.");
  await auth.api.impersonateUser({ headers: await headers(), body: { userId: input.userId } });

  const orgs = await listUserOrgs(input.userId);
  const audit = { admin, action: "admin.impersonation_started", reason: input.reason } as const;
  const changes = { after: { email: target.email, sessionMinutes: 60 } };
  await writeAdminAudit({ ...audit, target: { type: "user", id: target._id }, changes });
  for (const org of orgs) {
    await writeAdminAudit({
      ...audit,
      orgId: new Types.ObjectId(org.id),
      target: { type: "user", id: target._id },
      changes,
    });
  }
  return { path: orgs[0] ? `/${orgs[0].slug}` : "/onboarding" };
}

/** Ends an impersonation session and restores the admin's own. `adminId` = `session.impersonatedBy`. */
export async function endImpersonation(input: { adminId: string; targetUserId: string }) {
  await auth.api.stopImpersonating({ headers: await headers() });
  const target = await users().findOne({ _id: requireOid(input.targetUserId, "user") });
  const orgs = await listUserOrgs(input.targetUserId);
  const admin = { id: input.adminId, name: "", email: "" };
  const base = {
    admin,
    action: "admin.impersonation_stopped",
    target: { type: "user", id: input.targetUserId },
    changes: { after: { email: target?.email ?? null } },
  } as const;
  await writeAdminAudit(base);
  for (const org of orgs) await writeAdminAudit({ ...base, orgId: new Types.ObjectId(org.id) });
}
