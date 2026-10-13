import { Types } from "mongoose";

import type { Role } from "@/lib/auth/permissions";
import type { Mail, Seed } from "./mail-helpers";

/**
 * Members for an org made by `seedOrg`: `organization`, `user` and `member` documents written
 * straight to the collections Better Auth uses, one verified user per role.
 */
export async function seedTeam(
  m: Mail,
  seed: Pick<Seed, "orgId">,
  roles: Role[] = ["owner", "admin", "developer", "support", "viewer"],
  options: { name?: string; timezone?: string } = {},
) {
  const db = (await import("mongoose")).default.connection;
  const slug = `org-${seed.orgId.toHexString().slice(-8)}`;
  await db.collection("organization").insertOne({
    _id: seed.orgId,
    name: options.name ?? "Acme",
    slug,
    createdAt: new Date(),
  });
  if (options.timezone) {
    await m.models.OrgSettingsModel.updateOne(
      { orgId: seed.orgId },
      { timezone: options.timezone },
    );
  }
  const people: Record<
    string,
    { userId: Types.ObjectId; memberId: Types.ObjectId; email: string }
  > = {};
  for (const role of roles) {
    const userId = new Types.ObjectId();
    const memberId = new Types.ObjectId();
    const email = `${role}-${userId.toHexString().slice(-6)}@example.com`;
    await db
      .collection("user")
      .insertOne({ _id: userId, name: `${role} person`, email, emailVerified: true });
    await db
      .collection("member")
      .insertOne({
        _id: memberId,
        organizationId: seed.orgId,
        userId,
        role,
        createdAt: new Date(),
      });
    people[role] = { userId, memberId, email };
  }
  return { slug, people };
}

export type Team = Awaited<ReturnType<typeof seedTeam>>;

/** Bumps the org's hourly rollups the way `process-event` would. */
export async function addRollup(
  m: Mail,
  seed: Pick<Seed, "orgId" | "connectionId"> & { domain: { _id: Types.ObjectId } },
  counters: Partial<Record<import("@/lib/db/models/metric-rollups").RollupCounter, number>>,
  at: Date = new Date(),
  projectId: Types.ObjectId | null = null,
) {
  const { incrementRollups } = await import("@/lib/services/rollups");
  await incrementRollups(
    { orgId: seed.orgId, connectionId: seed.connectionId, domainId: seed.domain._id, projectId },
    { at, stream: "transactional", counters },
  );
  void m;
}

export const hoursAgo = (h: number, from = new Date()) => new Date(from.getTime() - h * 3_600_000);
