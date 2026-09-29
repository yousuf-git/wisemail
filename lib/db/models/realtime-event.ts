import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

export const REALTIME_TTL_SECONDS = 60 * 60;

const realtimeEventSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    /** For project-scoped members; null = visible org-wide. */
    projectId: { type: Schema.Types.ObjectId, default: null, immutable: true },
    /** Set for user-specific topics (e.g. notifications). */
    userId: { type: Schema.Types.ObjectId, ref: "user", default: null, immutable: true },
    /** e.g. `["threads", "thread:66f5…"]` */
    topics: { type: [String], required: true, immutable: true },
    /** Small field updates clients can apply without refetching; never secrets or email bodies. */
    patch: { type: Schema.Types.Mixed, default: null, immutable: true },
  },
  // Append-only, short-lived: createdAt only, TTL below.
  { timestamps: { createdAt: true, updatedAt: false }, collection: "realtime_events" },
);

// Replay after reconnect.
realtimeEventSchema.index({ orgId: 1, _id: 1 });
realtimeEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: REALTIME_TTL_SECONDS });

export type RealtimeEvent = InferSchemaType<typeof realtimeEventSchema>;
export type RealtimeEventDoc = HydratedDocument<RealtimeEvent>;

export const RealtimeEventModel =
  (models.RealtimeEvent as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("RealtimeEvent", realtimeEventSchema);
}
