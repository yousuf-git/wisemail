import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

const labelSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    name: { type: String, required: true, trim: true },
    color: { type: String, required: true },
  },
  { timestamps: true, collection: "labels" },
);

labelSchema.index({ orgId: 1, name: 1 }, { unique: true });

export type Label = InferSchemaType<typeof labelSchema>;
export type LabelDoc = HydratedDocument<Label>;

export const LabelModel = (models.Label as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Label", labelSchema);
}
