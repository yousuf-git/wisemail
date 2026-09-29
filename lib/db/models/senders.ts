import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

export const SENDER_STATUSES = [
  "active",
  "domain_unverified",
  "connection_inactive",
  "disabled",
] as const;
export type SenderStatus = (typeof SENDER_STATUSES)[number];

const senderSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    domainId: { type: Schema.Types.ObjectId, ref: "domains", required: true },
    localPart: { type: String, required: true, lowercase: true, trim: true },
    /** `localPart@domain` (cache). */
    address: { type: String, required: true, lowercase: true, trim: true },
    displayName: { type: String, default: "" },
    replyTo: { type: [String], default: [] },
    signatureHtml: { type: String, default: "" },
    isDefault: { type: Boolean, default: false },
    /** Derived from domain and connection; `disabled` is set only by a member. */
    status: { type: String, enum: SENDER_STATUSES, required: true, default: "active" },
    statusReason: { type: String },
    statusChangedAt: { type: Date },
    /** Cache: receiving is on for the sender's domain (or its reply-to domain). */
    canReceiveReplies: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  // Optimistic concurrency: a stale save is a conflict (DBD §1 rule 11).
  { timestamps: true, collection: "senders", optimisticConcurrency: true },
);

// Unique among live senders so a deleted sender frees its address.
senderSchema.index(
  { orgId: 1, address: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $type: "null" } } },
);
senderSchema.index({ orgId: 1, status: 1 });
senderSchema.index({ orgId: 1, domainId: 1 });

export type Sender = InferSchemaType<typeof senderSchema>;
export type SenderDoc = HydratedDocument<Sender>;

export const SenderModel = (models.Sender as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Sender", senderSchema);
}
