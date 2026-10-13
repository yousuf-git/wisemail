import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { PAID_PLANS } from "@wisemail/shared/stripe-prices";

export const PRICE_CHANGE_STATUSES = ["pending", "migrating", "done", "failed"] as const;
export type PriceChangeStatus = (typeof PRICE_CHANGE_STATUSES)[number];

const priceChangeSchema = new Schema(
  {
    plan: { type: String, enum: PAID_PLANS, required: true },
    interval: { type: String, enum: ["month", "year"], required: true },
    priceKey: { type: String, required: true },
    lookupKey: { type: String, required: true },
    oldAmountUsd: { type: Number, required: true },
    newAmountUsd: { type: Number, required: true },
    oldStripePriceId: { type: String, required: true },
    newStripePriceId: { type: String, required: true },
    productId: { type: String, default: null },
    status: {
      type: String,
      enum: PRICE_CHANGE_STATUSES,
      required: true,
      default: "pending",
    },
    migratedCount: { type: Number, required: true, default: 0 },
    failedCount: { type: Number, required: true, default: 0 },
    lastError: { type: String, default: null },
    actorId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "price_changes" },
);

priceChangeSchema.index({ plan: 1, interval: 1, status: 1 });
priceChangeSchema.index({ oldStripePriceId: 1, status: 1 });
priceChangeSchema.index({ createdAt: -1 });

export type PriceChange = InferSchemaType<typeof priceChangeSchema>;
export type PriceChangeDoc = HydratedDocument<PriceChange>;

export const PriceChangeModel =
  (models.PriceChange as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("PriceChange", priceChangeSchema);
}
