import "server-only";

import { Types } from "mongoose";

import { connectDb } from "@/lib/db/connect";
import {
  PLATFORM_SETTINGS_KEY,
  PlatformSettingsModel,
} from "@/lib/db/models/platform-settings";
import { ServiceError } from "@/lib/services/errors";

/** The single immutable platform Super Admin user id, or null if none claimed yet. */
export async function getSuperAdminUserId(): Promise<string | null> {
  await connectDb();
  const row = await PlatformSettingsModel.findOne({ key: PLATFORM_SETTINGS_KEY })
    .select({ superAdminUserId: 1 })
    .lean();
  const id = row?.superAdminUserId;
  return id ? String(id) : null;
}

export async function isSuperAdminUserId(userId: string): Promise<boolean> {
  const id = await getSuperAdminUserId();
  return !!id && id === userId;
}

/** Refuse destructive admin ops against the Super Admin. */
export async function assertNotSuperAdmin(userId: string, verb: string) {
  if (await isSuperAdminUserId(userId)) {
    throw new ServiceError("forbidden", `The Super Admin can't be ${verb}.`);
  }
}

/**
 * Claim the single Super Admin slot for `userId`. Idempotent for the same user;
 * refuses when another Super Admin already exists.
 */
export async function claimSuperAdmin(userId: string): Promise<"claimed" | "already"> {
  await connectDb();
  if (!Types.ObjectId.isValid(userId)) {
    throw new ServiceError("validation", "Invalid user id.");
  }
  const oid = new Types.ObjectId(userId);
  const existing = await getSuperAdminUserId();
  if (existing === userId) return "already";
  if (existing) {
    throw new ServiceError("conflict", "A Super Admin already exists. Only one is allowed.");
  }

  const res = await PlatformSettingsModel.updateOne(
    {
      key: PLATFORM_SETTINGS_KEY,
      $or: [{ superAdminUserId: null }, { superAdminUserId: { $exists: false } }],
    },
    { $set: { superAdminUserId: oid } },
  );

  if (res.matchedCount === 0) {
    // Settings row may not exist yet (fresh DB) — caller should seed catalog first.
    const afterMissing = await getSuperAdminUserId();
    if (afterMissing === userId) return "already";
    if (afterMissing) {
      throw new ServiceError("conflict", "A Super Admin already exists. Only one is allowed.");
    }
    await PlatformSettingsModel.updateOne(
      { key: PLATFORM_SETTINGS_KEY },
      { $set: { superAdminUserId: oid } },
      { upsert: false },
    );
  }

  const after = await getSuperAdminUserId();
  if (after === userId) return res.modifiedCount > 0 ? "claimed" : "already";
  throw new ServiceError("conflict", "A Super Admin already exists. Only one is allowed.");
}
