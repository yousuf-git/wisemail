import type { SchemaDefinition } from "mongoose";
import { Schema } from "mongoose";

/**
 * Fields shared by every Resend mirror (DBD §1 rule 4): tenant, owning connection, Resend's id.
 * `syncedAt` stamps the sync run (its `startedAt`) that last saw the object in Resend; after a
 * complete pass over a resource, mirrors with an older stamp are gone remotely and are removed.
 */
export const mirrorFields = {
  orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
  connectionId: {
    type: Schema.Types.ObjectId,
    ref: "connections",
    required: true,
    immutable: true,
  },
  resendId: { type: String, required: true, immutable: true },
  syncedAt: { type: Date },
} satisfies SchemaDefinition;

/** The mirror collections a sync writes, with the topic clients subscribe to for each. */
export const MIRROR_KINDS = [
  "domains",
  "api_keys",
  "segments",
  "topics",
  "contact_properties",
  "templates",
  "contacts",
  "broadcasts",
  "automations",
] as const;
export type MirrorKind = (typeof MIRROR_KINDS)[number];
