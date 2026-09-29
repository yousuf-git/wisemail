import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

export const CLEANUP_ACTIONS = ["archive", "trash", "delete"] as const;
export type CleanupAction = (typeof CLEANUP_ACTIONS)[number];
export const CLEANUP_KINDS = ["rule", "block_sender"] as const;

/** Cleanup rules (DBD §4.9, PRD §5.16, P1). `delete` is permanent and Owner/Admin only. */
const cleanupRuleSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    name: { type: String, required: true, trim: true },
    enabled: { type: Boolean, required: true, default: true },
    /** Empty arrays = the whole organization. */
    scope: {
      type: new Schema(
        {
          connectionIds: { type: [Schema.Types.ObjectId], default: [] },
          projectIds: { type: [Schema.Types.ObjectId], default: [] },
          mailboxAddresses: { type: [String], default: [] },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    /** Every condition that is set must match. */
    match: {
      type: new Schema(
        {
          direction: { type: String, enum: ["inbound", "outbound"] },
          fromAddress: String,
          fromDomain: String,
          subjectContains: String,
          tag: {
            type: new Schema({ name: String, value: String }, { _id: false }),
          },
          aiCategory: String,
          olderThanDays: Number,
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    action: { type: String, enum: CLEANUP_ACTIONS, required: true },
    kind: { type: String, enum: CLEANUP_KINDS, required: true, default: "rule" },
    lastRunAt: Date,
    lastRunCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "user", required: true },
  },
  { timestamps: true, collection: "cleanup_rules" },
);

cleanupRuleSchema.index({ orgId: 1, createdAt: -1 });
cleanupRuleSchema.index({ enabled: 1, kind: 1 });

export type CleanupRule = InferSchemaType<typeof cleanupRuleSchema>;
export type CleanupRuleDoc = HydratedDocument<CleanupRule>;

export const CleanupRuleModel =
  (models.CleanupRule as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("CleanupRule", cleanupRuleSchema);
}
