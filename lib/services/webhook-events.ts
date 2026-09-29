import "server-only";

import { connectDb } from "@/lib/db/connect";
import { parseId } from "@/lib/db/ids";
import { WebhookEventModel } from "@/lib/db/models/webhook-events";

/**
 * Stub for `process-event` (TRD §2.1 step 5). Loads the stored event and marks it processed.
 * TODO(phase 4): upsert the `emails` document and timeline, rank status, `$inc` metric rollups,
 * notifications, alert rules, tombstone handling (`ignoredReason: deleted`), and for
 * `email.received` enqueue `fetch-inbound`. Must stay idempotent.
 */
export async function processWebhookEvent(
  eventId: string,
): Promise<{ found: boolean; type?: string }> {
  await connectDb();
  const id = parseId("webhook_events", eventId);
  if (!id) return { found: false };
  const event = await WebhookEventModel.findOneAndUpdate(
    { _id: id, processedAt: null },
    { $set: { processedAt: new Date() } },
    { returnDocument: "after" },
  ).lean();
  if (event) return { found: true, type: event.type };
  // Already processed (a retry or duplicate delivery) or gone (retention, connection deleted).
  const existing = await WebhookEventModel.findById(id, { type: 1 }).lean();
  return { found: !!existing, type: existing?.type };
}
