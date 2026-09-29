import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { mirrorFields } from "./mirror";

const step = new Schema(
  {
    key: { type: String, required: true },
    type: { type: String, required: true },
    config: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);
const edge = new Schema(
  { from: { type: String, required: true }, to: { type: String, required: true }, type: String },
  { _id: false },
);

const automationSchema = new Schema(
  {
    ...mirrorFields,
    name: { type: String, required: true },
    status: { type: String, enum: ["enabled", "disabled"], required: true },
    /** As returned by Resend. */
    steps: { type: [step], default: [] },
    /** Step graph edges. */
    connections: { type: [edge], default: [] },
    resendCreatedAt: { type: Date },
    resendUpdatedAt: { type: Date },
  },
  { timestamps: true, collection: "automations" },
);

automationSchema.index({ connectionId: 1, resendId: 1 }, { unique: true });
automationSchema.index({ orgId: 1, connectionId: 1 });

export type Automation = InferSchemaType<typeof automationSchema>;
export type AutomationDoc = HydratedDocument<Automation>;

export const AutomationModel =
  (models.Automation as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Automation", automationSchema);
}
