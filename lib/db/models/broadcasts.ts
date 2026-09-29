import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { mirrorFields } from "./mirror";

export const BROADCAST_STATUSES = [
  "draft",
  "scheduled",
  "queued",
  "sending",
  "sent",
  "canceled",
  "failed",
] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

const stats = new Schema(
  {
    recipients: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
    complained: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 },
  },
  { _id: false },
);

const broadcastSchema = new Schema(
  {
    ...mirrorFields,
    // Drafts created in Wisemail have no Resend id until they are created there (DBD §4.6), so it
    // is optional here and the unique index is sparse.
    resendId: { type: String },
    name: { type: String },
    segmentId: { type: Schema.Types.ObjectId, ref: "segments", default: null },
    topicId: { type: Schema.Types.ObjectId, ref: "topics", default: null },
    /** Raw `from` as Resend reports it; `senderId` arrives with senders (Phase 4). */
    from: { type: String },
    senderId: { type: Schema.Types.ObjectId, ref: "senders", default: null },
    subject: { type: String },
    previewText: { type: String },
    html: { type: String },
    text: { type: String },
    templateId: { type: Schema.Types.ObjectId, ref: "templates", default: null },
    status: { type: String, enum: BROADCAST_STATUSES, required: true, default: "draft" },
    scheduledAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    /** (cache) from events; never written by sync. */
    stats: { type: stats },
    resendCreatedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "user", default: null },
  },
  { timestamps: true, collection: "broadcasts", optimisticConcurrency: true },
);

broadcastSchema.index({ connectionId: 1, resendId: 1 }, { unique: true, sparse: true });
broadcastSchema.index({ orgId: 1, connectionId: 1, status: 1 });
broadcastSchema.index({ orgId: 1, segmentId: 1 });

export type Broadcast = InferSchemaType<typeof broadcastSchema>;
export type BroadcastDoc = HydratedDocument<Broadcast>;

export const BroadcastModel = (models.Broadcast as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Broadcast", broadcastSchema);
}
