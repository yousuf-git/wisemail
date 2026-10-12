import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { mirrorFields } from "./mirror";

const contactPropertySchema = new Schema(
  {
    ...mirrorFields,
    key: { type: String, required: true },
    type: { type: String, enum: ["string", "number"], required: true },
    fallbackValue: { type: Schema.Types.Mixed, default: null },
    resendCreatedAt: { type: Date },
  },
  { timestamps: true, collection: "contact_properties" },
);

contactPropertySchema.index({ connectionId: 1, resendId: 1 }, { unique: true });
contactPropertySchema.index({ orgId: 1, connectionId: 1 });

export type ContactProperty = InferSchemaType<typeof contactPropertySchema>;
export type ContactPropertyDoc = HydratedDocument<ContactProperty>;

export const ContactPropertyModel =
  (models.ContactProperty as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("ContactProperty", contactPropertySchema);
}
