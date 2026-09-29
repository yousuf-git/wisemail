import "server-only";

import type { ClientSession, Types } from "mongoose";

import {
  DAILY_ROLLUP_TTL_DAYS,
  HOURLY_ROLLUP_TTL_DAYS,
  LATENCY_BUCKETS,
  LATENCY_BUCKET_EDGES_MS,
  MetricRollupModel,
  type RollupCounter,
  type RollupGranularity,
} from "@/lib/db/models/metric-rollups";

/**
 * `metric_rollups` counters (DBD §4.7, TRD §2.7). Each event `$inc`s an hourly and a daily bucket
 * for the whole domain (`dimension: all`) and for its stream (`transactional` / `broadcast` /
 * `inbound`). Written with the native driver so the counters and the latency histogram can be
 * incremented by one upsert. Pass the caller's `session` so the increments commit (or roll back)
 * together with the event's processing: that is what makes them exactly-once.
 */

export type RollupScope = {
  orgId: Types.ObjectId;
  connectionId: Types.ObjectId;
  domainId: Types.ObjectId | null;
  projectId: Types.ObjectId | null;
};

export type RollupStream = "transactional" | "broadcast" | "inbound";

export function bucketStart(at: Date, granularity: RollupGranularity): Date {
  const d = new Date(at);
  if (granularity === "day") d.setUTCHours(0, 0, 0, 0);
  else d.setUTCMinutes(0, 0, 0);
  return d;
}

export function latencyBucketIndex(ms: number): number {
  const i = LATENCY_BUCKET_EDGES_MS.findIndex((edge) => ms <= edge);
  return i === -1 ? LATENCY_BUCKETS - 1 : i;
}

export type RollupIncrement = {
  at: Date;
  stream: RollupStream;
  counters: Partial<Record<RollupCounter, number>>;
  /** Delivery latency sample (sent -> delivered), when known. */
  latencyMs?: number;
};

export async function incrementRollups(
  scope: RollupScope,
  inc: RollupIncrement,
  options: { session?: ClientSession } = {},
): Promise<void> {
  const counters = Object.entries(inc.counters).filter(([, n]) => !!n);
  const hasLatency = inc.latencyMs !== undefined && inc.latencyMs >= 0;
  if (counters.length === 0 && !hasLatency) return;

  const dimensions = [
    { kind: "all", value: "" },
    { kind: "stream", value: inc.stream },
  ] as const;
  const granularities: RollupGranularity[] = ["hour", "day"];
  const now = new Date();

  const keys = granularities.flatMap((granularity) =>
    dimensions.map((dimension) => ({
      granularity,
      dimension,
      filter: {
        orgId: scope.orgId,
        granularity,
        bucketStart: bucketStart(inc.at, granularity),
        connectionId: scope.connectionId,
        domainId: scope.domainId,
        "dimension.kind": dimension.kind,
        "dimension.value": dimension.value,
      },
    })),
  );

  const collection = MetricRollupModel.collection;
  await collection.bulkWrite(
    keys.map(({ granularity, dimension, filter }) => ({
      updateOne: {
        filter,
        update: {
          ...(counters.length > 0
            ? { $inc: Object.fromEntries(counters.map(([name, n]) => [`counts.${name}`, n])) }
            : {}),
          $setOnInsert: {
            projectId: scope.projectId,
            dimension: { kind: dimension.kind, value: dimension.value },
            deliveryLatencyMs: {
              buckets: new Array(LATENCY_BUCKETS).fill(0),
              count: 0,
              sum: 0,
            },
            expireAt: new Date(
              now.getTime() +
                (granularity === "hour" ? HOURLY_ROLLUP_TTL_DAYS : DAILY_ROLLUP_TTL_DAYS) *
                  86_400_000,
            ),
            createdAt: now,
          },
          $set: { updatedAt: now },
        },
        upsert: true,
      },
    })),
    { ordered: true, session: options.session },
  );

  if (hasLatency) {
    const index = latencyBucketIndex(inc.latencyMs!);
    // The buckets array exists after the upsert above, so `$inc` on an index is safe.
    await collection.bulkWrite(
      keys.map(({ filter }) => ({
        updateOne: {
          filter,
          update: {
            $inc: {
              [`deliveryLatencyMs.buckets.${index}`]: 1,
              "deliveryLatencyMs.count": 1,
              "deliveryLatencyMs.sum": Math.round(inc.latencyMs!),
            },
          },
        },
      })),
      { ordered: true, session: options.session },
    );
  }
}
