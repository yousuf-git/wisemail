import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

export const SYNC_TRIGGERS = ["initial", "scheduled", "manual"] as const;
export const STAGE_STATUSES = ["pending", "running", "completed", "failed"] as const;
export const SYNC_STATUSES = ["running", "completed", "failed"] as const;

const syncRunSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    connectionId: {
      type: Schema.Types.ObjectId,
      ref: "connections",
      required: true,
      immutable: true,
    },
    trigger: { type: String, enum: SYNC_TRIGGERS, required: true },
    status: { type: String, enum: SYNC_STATUSES, required: true, default: "running" },
    /** Stage being worked on (or that failed); one of `SYNC_STAGE_KEYS` in `lib/services/sync.ts`. */
    stage: { type: String },
    /** Set when the run failed: plain-language reason, no secrets. */
    error: { type: String },
    /**
     * Per-stage checkpoints so a timed-out run resumes where it stopped (TRD §2.2.4).
     * `name` is the stage key; `cursor` is the stage's opaque resume point; `count` is items
     * upserted so far and `removed` mirrors dropped after the stage's complete pass.
     */
    resources: {
      type: [
        new Schema(
          {
            name: { type: String, required: true },
            status: { type: String, enum: STAGE_STATUSES, required: true },
            cursor: String,
            count: { type: Number, default: 0 },
            removed: { type: Number, default: 0 },
            error: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    startedAt: { type: Date, required: true, default: () => new Date() },
    finishedAt: { type: Date },
  },
  { timestamps: true, collection: "sync_runs" },
);

syncRunSchema.index({ orgId: 1, connectionId: 1, startedAt: -1 });
syncRunSchema.index({ connectionId: 1, status: 1 });

export type SyncRun = InferSchemaType<typeof syncRunSchema>;
export type SyncRunDoc = HydratedDocument<SyncRun>;

export const SyncRunModel = (models.SyncRun as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("SyncRun", syncRunSchema);
}
