import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

const usagePeriodSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    periodStart: { type: Date, required: true, immutable: true },
    periodEnd: { type: Date, required: true },
    /** Plan when the period started (reporting only). */
    plan: { type: String, required: true },
    /** Tracked-email allowance in effect (kept current when the plan changes). */
    allowance: { type: Number, required: true },
    emailsTracked: {
      transactional: { type: Number, default: 0 },
      broadcast: { type: Number, default: 0 },
      inbound: { type: Number, default: 0 },
    },
    /** Tracked emails per UTC day (`YYYY-MM-DD` -> counts) for the usage chart. */
    daily: { type: Schema.Types.Mixed, default: () => ({}) },
    /** Cost analysis only; not incremented yet. */
    eventsIngested: { type: Number, default: 0 },
    aiCreditsUsed: {
      allowance: { type: Number, default: 0 },
      pack: { type: Number, default: 0 },
    },
    /** Thresholds (percent) already notified this period, e.g. `[80, 100]`. */
    thresholdsNotified: { type: [Number], default: [] },
    overage: {
      emails: { type: Number, default: 0 },
      /** Billing Meter units (10k emails, rounded up) already reported to Stripe. */
      reportedToStripe: { type: Number, default: 0 },
      lastReportedAt: Date,
    },
  },
  { timestamps: true, collection: "usage_periods", minimize: false },
);

usagePeriodSchema.index({ orgId: 1, periodStart: -1 }, { unique: true });

export type UsageStream = "transactional" | "broadcast" | "inbound";
export type UsagePeriod = InferSchemaType<typeof usagePeriodSchema>;
export type UsagePeriodDoc = HydratedDocument<UsagePeriod>;

export const UsagePeriodModel =
  (models.UsagePeriod as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("UsagePeriod", usagePeriodSchema);
}
