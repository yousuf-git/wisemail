import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

/** Raw Resend events are kept this long until plan-based retention lands (Phase 7). */
export const DEFAULT_EVENT_RETENTION_DAYS = 30;

const webhookEventSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    connectionId: {
      type: Schema.Types.ObjectId,
      ref: "connections",
      required: true,
      immutable: true,
    },
    /** Svix message id: the idempotency key. */
    svixId: { type: String, required: true, immutable: true },
    type: { type: String, required: true, immutable: true },
    /** From the payload's `created_at`. */
    occurredAt: { type: Date, required: true, immutable: true },
    /** `data.email_id` / contact id / domain id. */
    resendObjectId: { type: String, immutable: true },
    /** Linked during processing. */
    emailId: { type: Schema.Types.ObjectId, ref: "emails", default: null },
    /** Original `data` object. */
    payload: { type: Schema.Types.Mixed, required: true, immutable: true },
    processedAt: { type: Date, default: null },
    processingError: { type: String },
    ignoredReason: { type: String },
    expireAt: { type: Date, required: true },
  },
  // Raw and immutable: createdAt only.
  { timestamps: { createdAt: true, updatedAt: false }, collection: "webhook_events" },
);

webhookEventSchema.index({ connectionId: 1, svixId: 1 }, { unique: true });
webhookEventSchema.index({ emailId: 1, occurredAt: 1 });
webhookEventSchema.index({ orgId: 1, type: 1, occurredAt: -1 });
webhookEventSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export type WebhookEvent = InferSchemaType<typeof webhookEventSchema>;
export type WebhookEventDoc = HydratedDocument<WebhookEvent>;

export const WebhookEventModel =
  (models.WebhookEvent as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("WebhookEvent", webhookEventSchema);
}
