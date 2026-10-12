import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { FEATURES, PLANS } from "@wisemail/shared/plans";

const limitsSchema = new Schema(
  {
    connections: { type: Number, required: true },
    members: { type: Number, default: null },
    projects: { type: Number, default: null },
    alertRules: { type: Number, default: null },
    emailsTrackedPerMonth: { type: Number, required: true },
    retentionDays: { type: Number, required: true },
    aiCreditsPerMonth: { type: Number, required: true },
    auditLogDays: { type: Number, required: true },
  },
  { _id: false },
);

const featuresSchema = new Schema(
  Object.fromEntries(FEATURES.map((f) => [f, { type: Boolean, required: true }])),
  { _id: false },
);

const planSchema = new Schema(
  {
    _id: { type: String, enum: PLANS, required: true },
    label: { type: String, required: true },
    tagline: { type: String, required: true },
    priceMonthly: { type: Number, required: true },
    priceAnnualPerMonth: { type: Number, required: true },
    limits: { type: limitsSchema, required: true },
    features: { type: featuresSchema, required: true },
    overagePer10kUsd: { type: Number, default: null },
    extraConnectionUsd: { type: Number, default: null },
    support: { type: String, required: true },
    sortOrder: { type: Number, required: true },
    stripe: {
      type: new Schema(
        {
          productId: { type: String, default: null },
          priceMonthlyId: { type: String, default: null },
          priceAnnualId: { type: String, default: null },
          overagePriceId: { type: String, default: null },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
  },
  { timestamps: true, collection: "plans" },
);

export type PlanDoc = HydratedDocument<InferSchemaType<typeof planSchema> & { _id: string }>;

export const PlanModel = (models.Plan as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Plan", planSchema);
}
