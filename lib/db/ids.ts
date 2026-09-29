import { Types } from "mongoose";

/**
 * Branded ids (TRD §2.12). `Id<"emails">` and `Id<"threads">` are both ObjectIds at runtime
 * but not assignable to one another. Better Auth documents use ObjectId `_id`s too (its MongoDB
 * adapter stores ids and foreign keys as ObjectId and returns hex strings), so `Id<"organization">`
 * and `Id<"user">` are ObjectIds that app collections can reference directly.
 */
declare const brand: unique symbol;

export const COLLECTIONS = [
  "user",
  "session",
  "organization",
  "member",
  "invitation",
  "org_settings",
  "audit_logs",
  "realtime_events",
  "connections",
  "webhook_events",
  "sync_runs",
  "domains",
  "emails",
  "threads",
  "email_contents",
  "attachments",
  "labels",
  "senders",
  "drafts",
  "deletion_tombstones",
  "metric_rollups",
  "alert_rules",
  "alert_incidents",
  "notifications",
  "projects",
  "broadcasts",
  "templates",
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];

/** Server-side id (ObjectId). */
export type Id<C extends CollectionName> = Types.ObjectId & { readonly [brand]: C };
/** Client-side id (24-char hex string). */
export type IdString<C extends CollectionName> = string & { readonly [brand]: C };

export class InvalidIdError extends Error {
  readonly code = "invalid_id";
  constructor(
    readonly collection: string,
    readonly value: unknown,
  ) {
    super(`Invalid ${collection} id`);
    this.name = "InvalidIdError";
  }
}

const HEX24 = /^[0-9a-f]{24}$/i;

export function isIdString(value: unknown): value is string {
  return typeof value === "string" && HEX24.test(value);
}

/** Validates and brands a string or ObjectId. Throws `InvalidIdError`. */
export function toId<C extends CollectionName>(
  collection: C,
  value: string | Types.ObjectId,
): Id<C> {
  if (value instanceof Types.ObjectId) return value as Id<C>;
  if (!isIdString(value)) throw new InvalidIdError(collection, value);
  return new Types.ObjectId(value) as Id<C>;
}

/** Like `toId` but returns null for invalid input (use for untrusted params). */
export function parseId<C extends CollectionName>(collection: C, value: unknown): Id<C> | null {
  if (value instanceof Types.ObjectId) return value as Id<C>;
  if (!isIdString(value)) return null;
  return new Types.ObjectId(value) as Id<C>;
}

/** Mints a fresh id; the collection argument only fixes the brand. */
export function newId<C extends CollectionName>(collection: C): Id<C> {
  void collection;
  return new Types.ObjectId() as Id<C>;
}

export function idToString<C extends CollectionName>(id: Id<C>): IdString<C> {
  return id.toHexString() as IdString<C>;
}
