import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

export const PLANS = ["free", "pro", "team", "agency"] as const;
export const PLAN_STATES = ["trialing", "active", "past_due", "canceling", "free"] as const;
export type Plan = (typeof PLANS)[number];
export type PlanState = (typeof PLAN_STATES)[number];

/** Calendar month containing `now` (UTC): the billing period for orgs without a Stripe period. */
export function calendarMonth(now: Date = new Date()): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

const limitOverrides = new Schema(
  {
    connections: Number,
    members: Number,
    projects: Number,
    alertRules: Number,
    emailsTrackedPerMonth: Number,
    retentionDays: Number,
    aiCreditsPerMonth: Number,
  },
  { _id: false },
);

const orgSettingsSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    plan: { type: String, enum: PLANS, required: true, default: "free" },
    planState: { type: String, enum: PLAN_STATES, required: true, default: "free" },
    trial: {
      type: new Schema({ startedAt: Date, endsAt: Date }, { _id: false }),
      default: null,
    },
    limitOverrides: { type: limitOverrides, default: undefined },
    billingPeriod: {
      type: new Schema(
        { start: { type: Date, required: true }, end: { type: Date, required: true } },
        { _id: false },
      ),
      required: true,
      default: () => calendarMonth(),
    },
    billingInterval: { type: String, enum: ["month", "year"], default: null },
    extraConnections: { type: Number, default: 0 },
    aiCredits: {
      type: new Schema(
        {
          periodAllowance: { type: Number, default: 0 },
          periodUsed: { type: Number, default: 0 },
          reserved: { type: Number, default: 0 },
          packBalance: { type: Number, default: 0 },
          packExpiresAt: Date,
          /** Start of the period `periodUsed` belongs to; `lib/ai/credits.ts` rolls it over. */
          periodStart: Date,
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    grace: {
      type: new Schema({ overAllowanceSince: Date, pastDueSince: Date }, { _id: false }),
      default: () => ({}),
    },
    pendingChange: {
      type: new Schema(
        { toPlan: String, effectiveAt: Date, retentionEffectiveAt: Date },
        { _id: false },
      ),
      default: null,
    },
    stripeCustomerId: String,
    /** The org's active Stripe subscription (the plan item plus extra-connection / overage items). */
    stripeSubscriptionId: String,
    /** End of the current Stripe billing cycle (the plan item's period; a year for annual plans). */
    stripePeriodEnd: Date,
    /** Stripe event time of the subscription state last applied; older events are ignored. */
    stripeSyncedAt: Date,
    timezone: { type: String, required: true, default: "UTC" },
    ai: {
      type: new Schema(
        {
          enabled: { type: Boolean, default: true },
          features: {
            triage: { type: Boolean, default: true },
            drafts: { type: Boolean, default: true },
            compose: { type: Boolean, default: true },
            anomalies: { type: Boolean, default: true },
          },
        },
        { _id: false },
      ),
      default: () => ({ enabled: true, features: {} }),
    },
    /**
     * Platform-admin suspension. While set, `getOrgContext` answers `suspended`: members see a
     * "workspace suspended" page and every action and API route refuses. Data keeps flowing in
     * (ingest, sync) so nothing is lost while the workspace is on hold.
     */
    suspended: {
      type: new Schema(
        {
          at: { type: Date, required: true },
          by: { type: Schema.Types.ObjectId, required: true },
          reason: { type: String, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "org_settings" },
);

orgSettingsSchema.index({ orgId: 1 }, { unique: true });
orgSettingsSchema.index({ orgId: 1, plan: 1 });

export type OrgSettings = InferSchemaType<typeof orgSettingsSchema>;
export type OrgSettingsDoc = HydratedDocument<OrgSettings>;

export const OrgSettingsModel =
  (models.OrgSettings as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("OrgSettings", orgSettingsSchema);
}
