import "server-only";

import { Types, type ClientSession } from "mongoose";

import type { AdminActor } from "@/lib/admin/guard";
import { writeAuditLog } from "@/lib/services/audit";

/**
 * Audit trail of platform-admin writes (all in `audit_logs`). Organization-scoped actions are
 * recorded under that org, so its Owners and Admins can see staff touched the workspace; actions
 * on a user (ban, sessions) are recorded under the platform scope, which no tenant can read.
 * Actions are named `admin.*`; `reason` is required for destructive ones.
 */
export const PLATFORM_SCOPE_ID = new Types.ObjectId("000000000000000000000000");

export type AdminAuditInput = {
  admin: AdminActor;
  action: `admin.${string}`;
  /** Omit for user-scoped actions (recorded under `PLATFORM_SCOPE_ID`). */
  orgId?: Types.ObjectId;
  target: { type: string; id: Types.ObjectId | string };
  reason?: string;
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
};

export async function writeAdminAudit(
  input: AdminAuditInput,
  options: { session?: ClientSession } = {},
) {
  return writeAuditLog(
    {
      orgId: input.orgId ?? PLATFORM_SCOPE_ID,
      actor: { type: "user", id: new Types.ObjectId(input.admin.id) },
      action: input.action,
      target: input.target,
      reason: input.reason,
      changes: input.changes,
    },
    options,
  );
}
