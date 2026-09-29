import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { mirrorFields } from "./mirror";

const segmentSchema = new Schema(
  {
    ...mirrorFields,
    name: { type: String, required: true },
    /** (cache) members among synced contacts. */
    contactCount: { type: Number, default: 0 },
    resendCreatedAt: { type: Date },
  },
  { timestamps: true, collection: "segments" },
);

segmentSchema.index({ connectionId: 1, resendId: 1 }, { unique: true });
segmentSchema.index({ orgId: 1, connectionId: 1 });

export type Segment = InferSchemaType<typeof segmentSchema>;
export type SegmentDoc = HydratedDocument<Segment>;

export const SegmentModel = (models.Segment as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Segment", segmentSchema);
}
