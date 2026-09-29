import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

/** Longer than any Resend or Wisemail retention (DBD §4.9). */
export const TOMBSTONE_RETENTION_DAYS = 800;

/**
 * Permanent deletes of Resend-backed emails (DBD §4.9). Checked by `process-event`, the sync
 * backfill and threading so a deleted email is never recreated. Written by the permanent-delete
 * flow (Phase 7); Phase 4 only reads them.
 */
const tombstoneSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    connectionId: {
      type: Schema.Types.ObjectId,
      ref: "connections",
      required: true,
      immutable: true,
    },
    kind: { type: String, enum: ["sent_email", "received_email"], required: true },
    resendId: { type: String, required: true },
    /** SHA-256 of the Message-ID (see `hashMessageId`). */
    messageIdHash: { type: String },
    deletedAt: { type: Date, required: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: "user", default: null },
    reason: { type: String, enum: ["user", "bulk", "rule", "trash_purge"], required: true },
    expireAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "deletion_tombstones" },
);

tombstoneSchema.index({ connectionId: 1, kind: 1, resendId: 1 }, { unique: true });
tombstoneSchema.index({ orgId: 1, messageIdHash: 1 });
tombstoneSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export type DeletionTombstone = InferSchemaType<typeof tombstoneSchema>;
export type DeletionTombstoneDoc = HydratedDocument<DeletionTombstone>;

export const DeletionTombstoneModel =
  (models.DeletionTombstone as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("DeletionTombstone", tombstoneSchema);
}
