import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { NOTIFICATION_TYPES } from "@/lib/notifications/types";

/** Notifications expire after 90 days (DBD §4.8). */
export const NOTIFICATION_TTL_DAYS = 90;

const notificationSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    /** One document per recipient member. */
    userId: { type: Schema.Types.ObjectId, ref: "user", required: true, immutable: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    /** In-app path. */
    link: { type: String, required: true },
    refs: {
      type: new Schema(
        {
          emailId: Schema.Types.ObjectId,
          threadId: Schema.Types.ObjectId,
          incidentId: Schema.Types.ObjectId,
          connectionId: Schema.Types.ObjectId,
          domainId: Schema.Types.ObjectId,
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    /** False for email-only deliveries: kept as the email's outbox row, hidden from the feed. */
    inApp: { type: Boolean, default: true },
    /** Makes fan-out idempotent (e.g. one per incident and recipient). */
    dedupKey: { type: String },
    readAt: { type: Date, default: null },
    /** The email channel: queued by fan-out, cleared once sent or skipped. */
    emailPending: { type: Boolean, default: false },
    emailAttempts: { type: Number, default: 0 },
    emailedAt: { type: Date },
    emailSkipped: { type: String, enum: ["quiet_hours", "rate_limited"] },
    expireAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "notifications" },
);

notificationSchema.index({ orgId: 1, userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
notificationSchema.index(
  { orgId: 1, userId: 1, dedupKey: 1 },
  { unique: true, partialFilterExpression: { dedupKey: { $type: "string" } } },
);
notificationSchema.index({ emailPending: 1 }, { partialFilterExpression: { emailPending: true } });
notificationSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export type Notification = InferSchemaType<typeof notificationSchema>;
export type NotificationDoc = HydratedDocument<Notification>;

export const NotificationModel =
  (models.Notification as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Notification", notificationSchema);
}
