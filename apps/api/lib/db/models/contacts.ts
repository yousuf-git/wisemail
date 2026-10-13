import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { mirrorFields } from "./mirror";

const subscription = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: "topics", required: true },
    subscription: { type: String, enum: ["opt_in", "opt_out"], required: true },
  },
  { _id: false },
);

const engagement = new Schema(
  {
    lastSentAt: Date,
    lastOpenedAt: Date,
    lastClickedAt: Date,
    sent: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
  },
  { _id: false },
);

const contactSchema = new Schema(
  {
    ...mirrorFields,
    /** Lowercased. */
    email: { type: String, required: true, lowercase: true, trim: true },
    firstName: { type: String },
    lastName: { type: String },
    /** Global unsubscribe. */
    unsubscribed: { type: Boolean, default: false },
    /** Values keyed by contact property key. */
    properties: { type: Schema.Types.Mixed, default: {} },
    segmentIds: { type: [Schema.Types.ObjectId], ref: "segments", default: [] },
    topicSubscriptions: { type: [subscription], default: [] },
    /** (cache) from events; written by event processing, never by sync. */
    engagement: { type: engagement },
    resendCreatedAt: { type: Date },
  },
  { timestamps: true, collection: "contacts", minimize: false },
);

contactSchema.index({ connectionId: 1, resendId: 1 }, { unique: true });
contactSchema.index({ connectionId: 1, email: 1 }, { unique: true });
contactSchema.index({ orgId: 1, email: 1 });
contactSchema.index({ orgId: 1, segmentIds: 1 });

export type Contact = InferSchemaType<typeof contactSchema>;
export type ContactDoc = HydratedDocument<Contact>;

export const ContactModel = (models.Contact as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Contact", contactSchema);
}
