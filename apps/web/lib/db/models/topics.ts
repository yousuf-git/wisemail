import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { mirrorFields } from "./mirror";

const topicSchema = new Schema(
  {
    ...mirrorFields,
    name: { type: String, required: true },
    description: { type: String },
    defaultSubscription: { type: String, enum: ["opt_in", "opt_out"], default: "opt_in" },
    /** Not returned by Resend's API (resend@6.30), so unset until we can read it. */
    visibility: { type: String, enum: ["public", "private"] },
    resendCreatedAt: { type: Date },
  },
  { timestamps: true, collection: "topics" },
);

topicSchema.index({ connectionId: 1, resendId: 1 }, { unique: true });
topicSchema.index({ orgId: 1, connectionId: 1 });

export type Topic = InferSchemaType<typeof topicSchema>;
export type TopicDoc = HydratedDocument<Topic>;

export const TopicModel = (models.Topic as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Topic", topicSchema);
}
