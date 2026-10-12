import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

export const TOUR_STATUSES = ["started", "completed", "skipped"] as const;
export type TourStatus = (typeof TOUR_STATUSES)[number];

/** One per user per org per tour (DBD §4.9). Follows the user across devices. */
const tourProgressSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, ref: "user", required: true, immutable: true },
    /** Matches a definition in `lib/tours`. */
    tourId: { type: String, required: true, immutable: true },
    /** Semver of the tour the user saw; a higher major version makes it eligible again. */
    version: { type: String, required: true },
    status: { type: String, enum: TOUR_STATUSES, required: true },
    /** Index of the last step shown. */
    lastStep: { type: Number, default: 0 },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    skippedAt: { type: Date, default: null },
    trigger: { type: String, enum: ["auto", "manual"], required: true, default: "auto" },
  },
  { timestamps: true, collection: "tour_progress" },
);

tourProgressSchema.index({ orgId: 1, userId: 1, tourId: 1 }, { unique: true });
tourProgressSchema.index({ userId: 1 });

export type TourProgress = InferSchemaType<typeof tourProgressSchema>;
export type TourProgressDoc = HydratedDocument<TourProgress>;

export const TourProgressModel =
  (models.TourProgress as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("TourProgress", tourProgressSchema);
}
