import "server-only";

import { createHmac, hkdfSync } from "node:crypto";

import type { Types } from "mongoose";

import { env } from "@/lib/env";
import type { ResendAdapter } from "./adapter";

/**
 * Team fingerprint (DBD `connections.resendTeamFingerprint`). Resend has no "who am I" endpoint,
 * so the team is identified by the oldest resource it owns: the earliest-created domain, else the
 * earliest-created API key. Resource ids are UUIDs that never change or move between teams.
 *
 * Why not the pasted key? Rotating a key must not look like a different team. Why the oldest
 * resource? Newer ones come and go (keys are rotated, domains added), the oldest is the least
 * likely to be deleted. A team's oldest domain and oldest key are both candidates when looking for
 * duplicates, so a team that has since added a domain is still recognised by its earlier key.
 * Known limit: if a team deletes both its oldest domain and oldest key, it looks like a new team.
 *
 * The id is HMAC-ed (SHA-256) with a key derived from BETTER_AUTH_SECRET and the org id, so the
 * stored value can't be reversed to a Resend id and doesn't correlate across organizations.
 */

const MAX_PAGES = 5;

async function oldest<T extends { id: string; createdAt: string }>(
  list: (after?: string) => Promise<{ data: T[]; hasMore: boolean; nextCursor?: string }>,
): Promise<T | null> {
  let best: T | null = null;
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await list(after);
    for (const item of result.data) {
      if (
        !best ||
        item.createdAt < best.createdAt ||
        (item.createdAt === best.createdAt && item.id < best.id)
      ) {
        best = item;
      }
    }
    if (!result.hasMore || !result.nextCursor) break;
    after = result.nextCursor;
  }
  return best;
}

let derived: Buffer | undefined;
function hmacKey(): Buffer {
  derived ??= Buffer.from(
    hkdfSync("sha256", env.BETTER_AUTH_SECRET, "", "wisemail/team-fingerprint/v1", 32),
  );
  return derived;
}

export function fingerprintOf(orgId: Types.ObjectId | string, resourceId: string): string {
  return createHmac("sha256", hmacKey()).update(`${orgId.toString()}:${resourceId}`).digest("hex");
}

export type TeamIdentity = {
  /** Stored on the connection. */
  fingerprint: string;
  /** Every fingerprint that identifies this team; a stored match on any is a duplicate. */
  candidates: string[];
};

export async function deriveTeamIdentity(
  adapter: ResendAdapter,
  orgId: Types.ObjectId | string,
): Promise<TeamIdentity> {
  const [domain, key] = await Promise.all([
    oldest((after) => adapter.listDomains({ limit: 100, after })),
    oldest((after) => adapter.listApiKeys({ limit: 100, after })),
  ]);
  const ids = [domain?.id, key?.id].filter((id): id is string => !!id);
  if (ids.length === 0) throw new Error("Resend account has no identifying resources");
  const candidates = ids.map((id) => fingerprintOf(orgId, id));
  return { fingerprint: candidates[0]!, candidates };
}
