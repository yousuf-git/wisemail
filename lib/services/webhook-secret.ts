import "server-only";

import { decryptSecret } from "@/lib/crypto/envelope";
import { connectDb } from "@/lib/db/connect";
import { ConnectionModel } from "@/lib/db/models/connections";

/** AAD binds each ciphertext to its record and field, so it can't be moved to another connection. */
export const keyAad = (connectionId: { toString(): string }) =>
  `connections:${connectionId.toString()}:apiKey`;
export const secretAad = (connectionId: { toString(): string }) =>
  `connections:${connectionId.toString()}:webhook.signingSecret`;

/**
 * Decrypts a connection's webhook signing secret. For server-side tooling only (the test-webhook
 * script, integration tests): no action, route or DTO may ever return it.
 */
export async function readWebhookSigningSecret(connectionId: string): Promise<string | null> {
  await connectDb();
  const doc = await ConnectionModel.findOne(
    { _id: connectionId, deletedAt: null },
    { "webhook.signingSecret": 1 },
  ).lean();
  if (!doc?.webhook?.signingSecret) return null;
  return decryptSecret(doc.webhook.signingSecret, { aad: secretAad(connectionId) });
}
