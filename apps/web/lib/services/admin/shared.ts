import "server-only";

import { Types } from "mongoose";

import { ServiceError } from "@/lib/services/errors";

export const DEFAULT_PAGE = 25;

/** 24-hex ids only; anything else is "not found" (no casting errors leak out). */
export function toOid(value: string): Types.ObjectId | null {
  return /^[0-9a-f]{24}$/i.test(value) ? new Types.ObjectId(value) : null;
}

export function requireOid(value: string, what: string): Types.ObjectId {
  const oid = toOid(value);
  if (!oid) throw new ServiceError("not_found", `We couldn't find that ${what}.`);
  return oid;
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Keyset cursor over `_id` (newest first): the last id of the previous page. */
export function decodeCursor(raw: string | null | undefined): Types.ObjectId | null {
  return raw ? toOid(raw) : null;
}

export const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
