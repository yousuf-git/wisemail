import type { ClientSession, Types } from "mongoose";

import { AuditLogModel } from "@/lib/db/models/audit-log";

export type AuditInput = {
  orgId: Types.ObjectId;
  actor: { type: "user"; id: Types.ObjectId } | { type: "system" };
  /** e.g. `organization.created`, `connection.created` */
  action: string;
  target: { type: string; id: Types.ObjectId | string };
  /** Never include secrets. */
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  ip?: string;
  userAgent?: string;
};

/** Appends an audit entry. Pass `session` to make it part of the caller's transaction. */
export async function writeAuditLog(input: AuditInput, options: { session?: ClientSession } = {}) {
  const { actor, ...rest } = input;
  const [doc] = await AuditLogModel.create(
    [
      {
        ...rest,
        actorType: actor.type,
        actorId: actor.type === "user" ? actor.id : null,
      },
    ],
    { session: options.session },
  );
  return doc;
}
