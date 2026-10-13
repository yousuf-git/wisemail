import "server-only";

import { decryptSecret } from "@/lib/crypto/envelope";
import { connectDb } from "@/lib/db/connect";
import { parseId } from "@/lib/db/ids";
import { ConnectionModel } from "@/lib/db/models/connections";
import { DEFAULT_EVENT_RETENTION_DAYS, WebhookEventModel } from "@/lib/db/models/webhook-events";
import { enqueueEventReceived } from "@/lib/jobs/send";
import { env } from "@/lib/env";
import { verifyWebhook } from "@/lib/resend/events";
import { processEventInline } from "./events-processing";
import { secretAad } from "./webhook-secret";

/** TRD §3: per-connection URL, Svix signature and timestamp, body size limit. */
export const MAX_INGEST_BYTES = 256 * 1024;

export type IngestOutcome =
  | { status: 200; body: { ok: true; duplicate?: true } }
  | { status: 400 | 404 | 413 | 500 | 503; body: { error: string } };

const fail = (status: 400 | 404 | 413 | 500 | 503, error: string): IngestOutcome => ({
  status,
  body: { error },
});

/**
 * Hot path (TRD §2.1): verify, dedupe, store, enqueue. No Resend calls, no processing.
 * `rawBody` must be the untouched request text: the signature covers its exact bytes.
 */
export async function ingestResendWebhook(input: {
  connectionId: string;
  rawBody: string;
  headers: Pick<Headers, "get">;
}): Promise<IngestOutcome> {
  const id = parseId("connections", input.connectionId);
  if (!id) return fail(404, "not_found");

  await connectDb();
  // Soft-deleted connections answer 404 like unknown ones.
  const connection = await ConnectionModel.findOne(
    { _id: id, deletedAt: null },
    { orgId: 1, webhook: 1 },
  ).lean();
  if (!connection) return fail(404, "not_found");
  // Between creating the webhook in Resend and storing its secret, deliveries can't be verified;
  // a 503 makes Resend retry.
  if (!connection.webhook?.signingSecret) return fail(503, "not_ready");

  let secret: string;
  try {
    secret = decryptSecret(connection.webhook.signingSecret, {
      aad: secretAad(id),
    });
  } catch (error) {
    console.error("[ingest] could not decrypt signing secret", id.toHexString(), error);
    return fail(500, "internal");
  }

  const verified = verifyWebhook(input.rawBody, input.headers, secret);
  if (!verified.ok) return fail(400, verified.reason);
  const { event, svixId } = verified;

  const occurred = new Date(event.created_at);
  const data = event.data as { email_id?: string; id?: string };
  const now = new Date();

  const result = await WebhookEventModel.updateOne(
    { connectionId: id, svixId },
    {
      $setOnInsert: {
        orgId: connection.orgId,
        connectionId: id,
        svixId,
        type: event.type,
        occurredAt: Number.isNaN(occurred.getTime()) ? now : occurred,
        resendObjectId: data.email_id ?? data.id,
        emailId: null,
        payload: event.data,
        processedAt: null,
        // TODO(phase 7): retention from the org's plan.
        expireAt: new Date(now.getTime() + DEFAULT_EVENT_RETENTION_DAYS * 86_400_000),
      },
    },
    { upsert: true },
  );

  // Already stored (Resend retries and Svix redeliveries): acknowledged, nothing more to do.
  if (result.upsertedCount === 0 || !result.upsertedId) {
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  await ConnectionModel.updateOne({ _id: id }, { $set: { lastEventAt: now } });

  try {
    const delivered = await enqueueEventReceived(result.upsertedId.toString());
    if (!delivered && env.INNGEST_DEV && env.NODE_ENV !== "production") {
      // Development without an Inngest server: process here, after the response path.
      void processEventInline(result.upsertedId.toString()).catch((error) =>
        console.error("[ingest] inline processing failed", error),
      );
    }
  } catch (error) {
    // Un-store so Resend's retry inserts and enqueues again instead of hitting the dedupe.
    console.error("[ingest] could not enqueue event", error);
    await WebhookEventModel.deleteOne({ _id: result.upsertedId });
    return fail(500, "enqueue_failed");
  }

  return { status: 200, body: { ok: true } };
}
