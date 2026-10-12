/**
 * Posts a Svix-signed sample Resend event to a connection's ingest URL, signing with that
 * connection's own signing secret (read through the service; it never leaves the server).
 *
 *   pnpm webhook:test <connectionId> [--type email.delivered] [--email-id em_123] [--url <ingestUrl>]
 *
 * Needs the same env as the app (.env.local) and the dev database (`pnpm db:dev`).
 */
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      type: { type: "string", default: "email.delivered" },
      "email-id": { type: "string" },
      url: { type: "string" },
    },
  });
  const connectionId = positionals[0];
  if (!connectionId) {
    console.error(
      "Usage: pnpm webhook:test <connectionId> [--type <event>] [--email-id <id>] [--url <url>]",
    );
    process.exit(2);
  }

  const { env } = await import("@/lib/env");
  const { readWebhookSigningSecret } = await import("@/lib/services/webhook-secret");
  const { signWebhook } = await import("@/lib/resend/events");
  const { disconnectDb } = await import("@/lib/db/connect");

  const secret = await readWebhookSigningSecret(connectionId);
  await disconnectDb();
  if (!secret) {
    console.error(`No live connection with a webhook secret for id ${connectionId}.`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const emailId = values["email-id"] ?? `em_${crypto.randomUUID().slice(0, 8)}`;
  const body = JSON.stringify({
    type: values.type,
    created_at: now,
    data: {
      email_id: emailId,
      created_at: now,
      from: "Wisemail Test <test@example.com>",
      to: ["jane@example.com"],
      subject: "Test event from scripts/send-test-webhook.ts",
    },
  });

  const url = values.url ?? `${env.APP_URL.replace(/\/$/, "")}/api/ingest/resend/${connectionId}`;
  const res = await fetch(url, { method: "POST", body, headers: signWebhook(secret, body) });
  console.log(`POST ${url} -> ${res.status} ${await res.text()}`);
  process.exit(res.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
