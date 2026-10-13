import "server-only";

import type { ClientSession, Types } from "mongoose";

import { DomainModel } from "@/lib/db/models/domains";
import { domainOf, normalizeAddress } from "@/lib/mail/address";

/** The org's domain a mail address belongs to (sending or receiving), or null. */
export async function resolveDomain(
  orgId: Types.ObjectId,
  connectionId: Types.ObjectId | null,
  address: string,
  options: { session?: ClientSession } = {},
): Promise<{ _id: Types.ObjectId; projectId: Types.ObjectId | null; name: string } | null> {
  const name = domainOf(address);
  if (!name) return null;
  const domain = await DomainModel.findOne(
    { orgId, ...(connectionId ? { connectionId } : {}), name },
    { projectId: 1, name: 1 },
    { session: options.session },
  ).lean();
  return domain
    ? { _id: domain._id, projectId: domain.projectId ?? null, name: domain.name }
    : null;
}

/** Names of every domain the org has synced; addresses on them are "ours", not external. */
export async function ownDomainNames(
  orgId: Types.ObjectId,
  options: { session?: ClientSession } = {},
): Promise<Set<string>> {
  const domains = await DomainModel.find(
    { orgId },
    { name: 1 },
    { session: options.session },
  ).lean();
  return new Set(domains.map((d) => d.name.toLowerCase()));
}

/** Lowercased, unique addresses that are not on one of our domains. */
export function externalAddresses(
  addresses: readonly string[],
  own: ReadonlySet<string>,
): string[] {
  return [
    ...new Set(
      addresses.map(normalizeAddress).filter((a) => a.includes("@") && !own.has(domainOf(a))),
    ),
  ];
}

export const isDuplicateKey = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;
