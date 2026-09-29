import "server-only";

import type { ClientSession, Types } from "mongoose";

import {
  DeletionTombstoneModel,
  TOMBSTONE_RETENTION_DAYS,
} from "@/lib/db/models/deletion-tombstones";
import { hashMessageId } from "@/lib/mail/thread";

/**
 * Tombstones keep permanently deleted mail deleted (DBD §1 rule 7, TRD §2.14): `process-event`,
 * the sync email backfill and threading check them, so a late `email.opened` or a later sync never
 * recreates the email. Nothing but Resend's id and a hash of the Message-ID is stored.
 */

export type TombstoneKind = "sent_email" | "received_email";
export type TombstoneReason = "user" | "bulk" | "rule" | "trash_purge";

export const tombstoneKind = (direction: "inbound" | "outbound"): TombstoneKind =>
  direction === "inbound" ? "received_email" : "sent_email";

export type TombstoneSource = {
  orgId: Types.ObjectId;
  connectionId: Types.ObjectId;
  direction: "inbound" | "outbound";
  resendId?: string | null;
  messageId?: string | null;
};

/**
 * Writes one tombstone per email that has a Resend id (an email Resend never accepted cannot come
 * back). Idempotent: an existing tombstone is left as it is. Returns how many were written.
 */
export async function writeTombstones(
  emails: TombstoneSource[],
  options: {
    reason: TombstoneReason;
    deletedBy?: Types.ObjectId | null;
    now?: Date;
    session?: ClientSession;
  },
): Promise<number> {
  const now = options.now ?? new Date();
  const ops = emails
    .filter((e) => !!e.resendId)
    .map((e) => ({
      updateOne: {
        filter: {
          connectionId: e.connectionId,
          kind: tombstoneKind(e.direction),
          resendId: e.resendId!,
        },
        update: {
          $setOnInsert: {
            orgId: e.orgId,
            ...(e.messageId ? { messageIdHash: hashMessageId(e.messageId) } : {}),
            deletedAt: now,
            deletedBy: options.deletedBy ?? null,
            reason: options.reason,
            expireAt: new Date(now.getTime() + TOMBSTONE_RETENTION_DAYS * 86_400_000),
            createdAt: now,
          },
        },
        upsert: true,
      },
    }));
  if (ops.length === 0) return 0;
  const result = await DeletionTombstoneModel.bulkWrite(ops, {
    ordered: false,
    session: options.session,
    timestamps: false,
  });
  return result.upsertedCount;
}

/** True when this Resend email was permanently deleted from Wisemail. */
export async function isTombstoned(
  input: { connectionId: Types.ObjectId; kind: TombstoneKind; resendId: string },
  options: { session?: ClientSession } = {},
): Promise<boolean> {
  return !!(await DeletionTombstoneModel.exists(input).session(options.session ?? null));
}

/**
 * Of these Resend ids, the ones that were permanently deleted. The sync email backfill calls this
 * once per page and skips the matches (`syncedEmailsToImport`).
 */
export async function tombstonedResendIds(
  connectionId: Types.ObjectId,
  kind: TombstoneKind,
  resendIds: string[],
  options: { session?: ClientSession } = {},
): Promise<Set<string>> {
  if (resendIds.length === 0) return new Set();
  const found = await DeletionTombstoneModel.find(
    { connectionId, kind, resendId: { $in: resendIds } },
    { resendId: 1 },
    { session: options.session },
  ).lean();
  return new Set(found.map((t) => t.resendId));
}

/** Drops tombstoned ids from a page of a Resend listing; what remains may be imported. */
export async function syncedEmailsToImport<T extends { id: string }>(
  connectionId: Types.ObjectId,
  kind: TombstoneKind,
  page: T[],
): Promise<T[]> {
  const dead = await tombstonedResendIds(
    connectionId,
    kind,
    page.map((p) => p.id),
  );
  return page.filter((p) => !dead.has(p.id));
}
