import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

/**
 * Stripe webhook events (and synthetic keys such as `pack:<checkoutSessionId>`) that the billing
 * webhook has already processed, so a replayed event changes nothing. Kept 90 days; Stripe stops
 * retrying after a few days.
 */
const stripeEventSchema = new Schema(
  {
    eventId: { type: String, required: true, immutable: true },
    type: { type: String, required: true },
    orgId: { type: Schema.Types.ObjectId, default: null },
    createdAt: { type: Date, default: () => new Date(), immutable: true },
  },
  { collection: "stripe_events" },
);

stripeEventSchema.index({ eventId: 1 }, { unique: true });
stripeEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export type StripeEvent = InferSchemaType<typeof stripeEventSchema>;
export type StripeEventDoc = HydratedDocument<StripeEvent>;

export const StripeEventModel =
  (models.StripeEvent as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("StripeEvent", stripeEventSchema);
}
