import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { ALERT_KINDS } from "@/lib/alerts/kinds";

const alertRuleSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ALERT_KINDS, required: true },
    /** Empty arrays = the whole organization. */
    scope: {
      type: new Schema(
        {
          connectionIds: { type: [Schema.Types.ObjectId], default: [] },
          projectIds: { type: [Schema.Types.ObjectId], default: [] },
          domainIds: { type: [Schema.Types.ObjectId], default: [] },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    condition: {
      type: new Schema(
        {
          operator: { type: String, enum: ["gt", "lt"], default: "gt" },
          threshold: { type: Number, default: 0 },
          windowMinutes: { type: Number, default: 60 },
          /** Avoids firing on tiny samples. */
          minVolume: { type: Number, default: 0 },
        },
        { _id: false },
      ),
      required: true,
    },
    channels: {
      type: new Schema(
        {
          inApp: { type: Boolean, default: true },
          /** Email teammates, each subject to their own notification preferences. */
          emailMembers: { type: Boolean, default: true },
          /** Extra addresses that always get the "fired" email. */
          email: { type: [String], default: [] },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    enabled: { type: Boolean, required: true, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "user", required: true },
  },
  // `__v` is the optimistic-concurrency version (DBD §1 rule 11).
  { timestamps: true, collection: "alert_rules", optimisticConcurrency: true },
);

alertRuleSchema.index({ orgId: 1, enabled: 1, kind: 1 });
alertRuleSchema.index({ orgId: 1, createdAt: -1 });

export type AlertRule = InferSchemaType<typeof alertRuleSchema>;
export type AlertRuleDoc = HydratedDocument<AlertRule>;

export const AlertRuleModel = (models.AlertRule as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("AlertRule", alertRuleSchema);
}
