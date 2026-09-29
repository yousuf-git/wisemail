import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { mirrorFields } from "./mirror";

const variable = new Schema(
  {
    key: { type: String, required: true },
    type: { type: String, required: true },
    fallback: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const templateSchema = new Schema(
  {
    ...mirrorFields,
    name: { type: String, required: true },
    alias: { type: String },
    subject: { type: String },
    from: { type: String },
    html: { type: String },
    text: { type: String },
    variables: { type: [variable], default: [] },
    status: { type: String, enum: ["draft", "published"], required: true, default: "draft" },
    resendCreatedAt: { type: Date },
    resendUpdatedAt: { type: Date },
  },
  // Edited in Wisemail from Phase 6: optimistic concurrency (DBD §1 rule 11).
  { timestamps: true, collection: "templates", optimisticConcurrency: true },
);

templateSchema.index({ connectionId: 1, resendId: 1 }, { unique: true });
templateSchema.index({ orgId: 1, connectionId: 1 });
templateSchema.index({ orgId: 1, name: 1 });

export type Template = InferSchemaType<typeof templateSchema>;
export type TemplateDoc = HydratedDocument<Template>;

export const TemplateModel = (models.Template as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Template", templateSchema);
}
