import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

export const AI_FEATURES = ["triage", "draft", "compose", "anomaly"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

/** Retention of usage rows (DBD `ai_usage`). */
export const AI_USAGE_TTL_DAYS = 400;

/** One settled AI call (TRD §2.9): who, what, which model, tokens and the credits it cost. */
const aiUsageSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    /** Null for background work (triage). */
    userId: { type: Schema.Types.ObjectId, ref: "user", default: null },
    feature: { type: String, enum: AI_FEATURES, required: true },
    /** Prompt version, e.g. `triage@1`. */
    promptVersion: { type: String },
    model: { type: String, required: true },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    credits: { type: Number, required: true },
    /** Which balance paid: the monthly allowance or purchased packs (feeds `usage_periods`). */
    creditsFrom: {
      type: new Schema(
        { allowance: { type: Number, default: 0 }, pack: { type: Number, default: 0 } },
        { _id: false },
      ),
      default: () => ({}),
    },
    refs: {
      type: new Schema(
        {
          emailId: { type: Schema.Types.ObjectId },
          threadId: { type: Schema.Types.ObjectId },
          incidentId: { type: Schema.Types.ObjectId },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    expireAt: {
      type: Date,
      default: () => new Date(Date.now() + AI_USAGE_TTL_DAYS * 86_400_000),
    },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "ai_usage" },
);

aiUsageSchema.index({ orgId: 1, createdAt: -1 });
aiUsageSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export type AiUsage = InferSchemaType<typeof aiUsageSchema>;
export type AiUsageDoc = HydratedDocument<AiUsage>;

export const AiUsageModel = (models.AiUsage as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("AiUsage", aiUsageSchema);
}
