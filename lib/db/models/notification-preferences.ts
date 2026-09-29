import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

const notificationPreferencesSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, ref: "user", required: true, immutable: true },
    /** `{ [type]: { inApp, email } }`; types without an entry use the defaults. */
    channels: { type: Schema.Types.Mixed, default: () => ({}) },
    /** Emails wait out this window (in-app notifications are unaffected). */
    quietHours: {
      type: new Schema(
        {
          start: { type: String, required: true },
          end: { type: String, required: true },
          timezone: { type: String, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    digest: { type: String, enum: ["none", "daily", "weekly"], default: "none" },
    digestLastSentAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "notification_preferences", minimize: false },
);

notificationPreferencesSchema.index({ orgId: 1, userId: 1 }, { unique: true });
notificationPreferencesSchema.index({ orgId: 1, digest: 1 });

export type NotificationPreferences = InferSchemaType<typeof notificationPreferencesSchema>;
export type NotificationPreferencesDoc = HydratedDocument<NotificationPreferences>;

export const NotificationPreferencesModel =
  (models.NotificationPreferences as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("NotificationPreferences", notificationPreferencesSchema);
}
