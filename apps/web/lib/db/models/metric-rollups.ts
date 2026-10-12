import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

export const ROLLUP_GRANULARITIES = ["hour", "day"] as const;
export type RollupGranularity = (typeof ROLLUP_GRANULARITIES)[number];
export const ROLLUP_DIMENSION_KINDS = [
  "all",
  "stream",
  "tag",
  "template",
  "sender",
  "mailbox_provider",
] as const;

export const ROLLUP_COUNTERS = [
  "sent",
  "delivered",
  "delivery_delayed",
  "bounced_hard",
  "bounced_soft",
  "complained",
  "opened_unique",
  "opened_total",
  "clicked_unique",
  "clicked_total",
  "failed",
  "suppressed",
  "received",
  "replied",
] as const;
export type RollupCounter = (typeof ROLLUP_COUNTERS)[number];

/** Upper bounds (ms) of the fixed delivery-latency histogram; the last bucket is open-ended. */
export const LATENCY_BUCKET_EDGES_MS = [
  500, 1_000, 2_000, 5_000, 10_000, 30_000, 60_000, 300_000,
] as const;
export const LATENCY_BUCKETS = LATENCY_BUCKET_EDGES_MS.length + 1;

/** Hourly buckets are kept 35 days (DBD §4.7); daily buckets follow plan retention (Phase 7). */
export const HOURLY_ROLLUP_TTL_DAYS = 35;
export const DAILY_ROLLUP_TTL_DAYS = 800;

const counts = Object.fromEntries(
  ROLLUP_COUNTERS.map((c) => [c, { type: Number, default: 0 }]),
) as Record<RollupCounter, { type: NumberConstructor; default: number }>;

const rollupSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    granularity: { type: String, enum: ROLLUP_GRANULARITIES, required: true },
    bucketStart: { type: Date, required: true },
    connectionId: { type: Schema.Types.ObjectId, ref: "connections", required: true },
    domainId: { type: Schema.Types.ObjectId, ref: "domains", default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "projects", default: null },
    dimension: {
      type: new Schema(
        {
          kind: { type: String, enum: ROLLUP_DIMENSION_KINDS, required: true },
          value: { type: String, default: "" },
        },
        { _id: false },
      ),
      required: true,
    },
    counts: { type: new Schema(counts, { _id: false }), default: () => ({}) },
    deliveryLatencyMs: {
      type: new Schema(
        {
          buckets: { type: [Number], default: () => new Array(LATENCY_BUCKETS).fill(0) },
          count: { type: Number, default: 0 },
          sum: { type: Number, default: 0 },
        },
        { _id: false },
      ),
    },
    expireAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "metric_rollups", minimize: false },
);

rollupSchema.index(
  {
    orgId: 1,
    granularity: 1,
    bucketStart: 1,
    connectionId: 1,
    domainId: 1,
    "dimension.kind": 1,
    "dimension.value": 1,
  },
  { unique: true, name: "rollup_bucket" },
);
rollupSchema.index({ orgId: 1, granularity: 1, bucketStart: 1 });
rollupSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export type MetricRollup = InferSchemaType<typeof rollupSchema>;
export type MetricRollupDoc = HydratedDocument<MetricRollup>;

export const MetricRollupModel =
  (models.MetricRollup as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("MetricRollup", rollupSchema);
}
