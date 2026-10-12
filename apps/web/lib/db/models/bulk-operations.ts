import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

export const BULK_ACTIONS = ["trash", "delete", "restore"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];
export const BULK_STATUSES = ["queued", "running", "done", "failed"] as const;
export type BulkStatus = (typeof BULK_STATUSES)[number];

/**
 * Progress record of a large or "all matching" trash/delete/restore (TRD §2.14 `bulk-delete`).
 * Holds the filter snapshot and the cap time, so mail that arrives after the request is never
 * included. The job works in batches ordered by `_id`; `cursor` makes a retried step idempotent.
 */
const bulkOperationSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    action: { type: String, enum: BULK_ACTIONS, required: true, immutable: true },
    /** What the filter selects: whole conversations or single emails. */
    target: { type: String, enum: ["threads", "emails"], required: true, immutable: true },
    /** Serialized `BulkFilter` (see `lib/deletion/filters.ts`). */
    filter: { type: Schema.Types.Mixed, required: true },
    /** The requester's project scope (`scoped: false` = unrestricted), re-applied by the job. */
    scoped: { type: Boolean, default: false },
    projectScope: { type: [Schema.Types.ObjectId], default: [] },
    /** Items created after this instant are not part of the operation. */
    capAt: { type: Date, required: true },
    reason: { type: String, enum: ["bulk", "empty_trash"], default: "bulk" },
    total: { type: Number, required: true, default: 0 },
    processed: { type: Number, default: 0 },
    cursor: { type: Schema.Types.ObjectId, default: null },
    status: { type: String, enum: BULK_STATUSES, required: true, default: "queued" },
    error: { type: String },
    /** For `restore`: the operation whose trashed items are brought back (the bulk Undo). */
    undoOf: { type: Schema.Types.ObjectId, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "user", required: true },
    finishedAt: { type: Date },
    expireAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "bulk_operations", minimize: false },
);

bulkOperationSchema.index({ orgId: 1, createdAt: -1 });
bulkOperationSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export type BulkOperation = InferSchemaType<typeof bulkOperationSchema>;
export type BulkOperationDoc = HydratedDocument<BulkOperation>;

export const BulkOperationModel =
  (models.BulkOperation as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("BulkOperation", bulkOperationSchema);
}
