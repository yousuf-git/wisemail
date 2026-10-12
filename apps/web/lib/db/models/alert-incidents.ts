import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

export const INCIDENT_STATUSES = ["open", "resolved", "acknowledged"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

const alertIncidentSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    ruleId: { type: Schema.Types.ObjectId, ref: "alert_rules", required: true, immutable: true },
    /** `<ruleId>:<subject>`; unique among active incidents so a firing condition opens one. */
    dedupKey: { type: String, required: true, immutable: true },
    /** True while open or acknowledged; the partial unique index hangs on it. */
    active: { type: Boolean, required: true, default: true },
    status: { type: String, enum: INCIDENT_STATUSES, required: true, default: "open" },
    /** Cached wording from the moment it opened (the rule may be renamed or deleted later). */
    title: { type: String, required: true },
    summary: { type: String, default: "" },
    ruleName: { type: String, required: true },
    kind: { type: String, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "projects", default: null },
    openedAt: { type: Date, required: true },
    resolvedAt: { type: Date },
    acknowledgedAt: { type: Date },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "user" },
    observedValue: { type: Number, default: 0 },
    lastEvaluatedAt: { type: Date },
    /** Scope ids, the threshold in force and sample email ids. */
    context: { type: Schema.Types.Mixed, default: () => ({}) },
    aiExplanation: {
      type: new Schema({ text: String, model: String, generatedAt: Date }, { _id: false }),
    },
  },
  { timestamps: true, collection: "alert_incidents" },
);

alertIncidentSchema.index(
  { orgId: 1, dedupKey: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
alertIncidentSchema.index({ orgId: 1, status: 1, openedAt: -1 });
alertIncidentSchema.index({ orgId: 1, ruleId: 1, openedAt: -1 });

export type AlertIncident = InferSchemaType<typeof alertIncidentSchema>;
export type AlertIncidentDoc = HydratedDocument<AlertIncident>;

export const AlertIncidentModel =
  (models.AlertIncident as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("AlertIncident", alertIncidentSchema);
}
