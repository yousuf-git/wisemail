/**
 * End-to-end check of the Phase 4 mail backend against an in-memory MongoDB, the fake Resend and
 * the fake object store (no dev database, no Inngest server, nothing left behind):
 *
 *   fake connection -> sync -> sender -> inbound email with an attachment (webhook ->
 *   process-event -> fetch-inbound) -> reply through the sending service -> delivered/opened
 *   webhooks -> the thread shows read receipts.
 *
 *   pnpm mail:check
 *
 * Jobs are recorded instead of sent (NODE_ENV=test semantics), and this script plays Inngest by
 * running the recorded `resend/event.received` and `email/inbound.fetch.requested` jobs itself.
 */
import { existsSync } from "node:fs";

// `server-only` throws outside the Next.js server bundle. This script runs the server modules in
// plain Node, so neutralize it (the react-server export condition would break `next/navigation`).
const serverOnly = require.resolve("server-only");
require.cache[serverOnly] = {
  id: serverOnly,
  filename: serverOnly,
  loaded: true,
  exports: {},
} as never;

(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.MONGOMS_SYSTEM_BINARY ??= "/opt/mongo/mongod";
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
const defaults: Record<string, string> = {
  BETTER_AUTH_SECRET: "check-secret-check-secret-check-secret-00",
  BETTER_AUTH_URL: "http://localhost:3000",
  APP_URL: "http://localhost:3000",
  ENCRYPTION_KEK_CURRENT: Buffer.alloc(32, 9).toString("base64"),
  ENCRYPTION_KEK_ID: "check-1",
};
for (const [key, value] of Object.entries(defaults)) process.env[key] ??= value;
process.env.RESEND_MODE = "fake";
process.env.STORAGE_MODE = "fake";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("mail-check");

  const { Types } = await import("mongoose");
  const models = await import("@/lib/db/models");
  const { connectDb, disconnectDb } = await import("@/lib/db/connect");
  const { encryptSecret } = await import("@/lib/crypto/envelope");
  const { keyAad, secretAad, readWebhookSigningSecret } =
    await import("@/lib/services/webhook-secret");
  const { FakeResendAdapter, createFakeReceivedEmail, fakeSentEmails } =
    await import("@/lib/resend/fake-adapter");
  const { signWebhook } = await import("@/lib/resend/events");
  const { ingestResendWebhook } = await import("@/lib/services/ingest");
  const { processWebhookEvent } = await import("@/lib/services/events-processing");
  const { fetchInboundEmail } = await import("@/lib/services/inbound");
  const { runSyncInline } = await import("@/lib/services/sync");
  const { createSender } = await import("@/lib/services/senders");
  const { sendEmail } = await import("@/lib/services/sending");
  const { getThread, listThreads } = await import("@/lib/services/emails");
  const { openAttachmentForUser } = await import("@/lib/services/attachments");
  const { sentJobs, resetSentJobs } = await import("@/lib/jobs/send");
  const { roleHasPermission } = await import("@/lib/auth/permissions");
  const { fakeStorageRoot } = await import("@/lib/storage/fake");
  const { rm } = await import("node:fs/promises");
  const mongoose = (await import("mongoose")).default;

  try {
    await connectDb();
    await Promise.all(
      Object.values(models).map((m) => (m as { init?: () => Promise<unknown> }).init?.()),
    );

    // 1. Org on a paid plan (files are stored by us) and a fake connection.
    const orgId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    await models.OrgSettingsModel.create({ orgId, plan: "pro" });
    const key = "re_checkteam_full";
    const connectionId = new Types.ObjectId();
    const webhook = await new FakeResendAdapter(key).createWebhook({
      endpoint: `http://localhost:3000/api/ingest/resend/${connectionId}`,
      events: ["email.received"],
    });
    await models.ConnectionModel.create({
      _id: connectionId,
      orgId,
      name: "Check connection",
      resendTeamFingerprint: "fp-check",
      createdBy: userId,
      status: "active",
      apiKey: encryptSecret(key, { aad: keyAad(connectionId) }),
      apiKeyLast4: key.slice(-4),
      webhook: {
        resendId: webhook.id,
        signingSecret: encryptSecret(webhook.signingSecret, { aad: secretAad(connectionId) }),
        events: ["email.received"],
        registeredAt: new Date(),
      },
    });
    await mongoose.connection
      .collection("member")
      .insertOne({ organizationId: orgId, userId, role: "owner" });
    const ctx = {
      user: { id: userId.toHexString(), name: "Owner", email: "owner@example.com", image: null },
      org: { id: orgId.toHexString(), name: "Check", slug: "check" },
      role: "owner",
      orgs: [],
      memberId: new Types.ObjectId().toHexString(),
      projectScope: null,
      can: (p: never) => roleHasPermission("owner", p),
    } as never;

    // 2. Sync mirrors the fake team's domains; a sender on the verified receiving domain.
    const synced = await runSyncInline({
      connectionId: connectionId.toHexString(),
      trigger: "initial",
    });
    check("sync completed", synced.status === "done", synced.status);
    const domain = await models.DomainModel.findOne({
      orgId,
      status: "verified",
      "receiving.enabled": true,
    });
    check("synced a verified receiving domain", !!domain, domain?.name);
    const sender = await createSender(ctx, {
      domainId: domain!._id.toHexString(),
      localPart: "support",
      displayName: "Support",
    });
    check("sender is active", sender.status === "active", sender.address);

    /** Delivers a signed webhook through the ingest hot path and runs the queued jobs. */
    const secret = (await readWebhookSigningSecret(connectionId.toHexString()))!;
    async function webhookEvent(type: string, data: Record<string, unknown>) {
      resetSentJobs();
      const body = JSON.stringify({ type, created_at: new Date().toISOString(), data });
      const res = await ingestResendWebhook({
        connectionId: connectionId.toHexString(),
        rawBody: body,
        headers: new Headers(signWebhook(secret, body)),
      });
      if (res.status !== 200) throw new Error(`ingest answered ${res.status}`);
      for (const job of [...sentJobs]) {
        if (job.name !== "resend/event.received") continue;
        const outcome = await processWebhookEvent(job.data.eventId);
        if (outcome.fetchInbound) await fetchInboundEmail(outcome.fetchInbound);
      }
    }

    // 3. Inbound email with an attachment and an embedded image.
    const inbound = createFakeReceivedEmail(key, {
      from: "Jane Doe <jane@customer.test>",
      to: [sender.address],
      subject: "Invoice question",
      text: "Where is my invoice?",
      html: '<p>Where is my <b>invoice</b>?</p><img src="cid:logo"><script>alert(1)</script>',
      attachments: [
        { filename: "Rechnung März.pdf", contentType: "application/pdf", content: "%PDF-1.4" },
        {
          filename: "logo.png",
          contentType: "image/png",
          contentId: "logo",
          content: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "base64",
          ),
        },
      ],
    });
    await webhookEvent("email.received", inbound.event);
    const inbox = await listThreads(ctx, { folder: "inbox" });
    const row = inbox.items[0];
    check(
      "inbound thread appears in the inbox, unread",
      inbox.items.length === 1 && !!row?.unread,
      row?.subject,
    );
    const thread = await getThread(ctx, row!.id);
    const message = thread.messages[0]!;
    const pdf = message.attachments.find((a) => a.filename === "Rechnung März.pdf");
    check(
      "body fetched and sanitized",
      message.contentStatus === "ready" && !/<script/i.test(message.html ?? ""),
    );
    check(
      "embedded image mapped to a signed URL",
      !!message.html && !message.html.includes("cid:"),
    );
    check("attachment listed with its exact name", !!pdf, pdf?.downloadUrl);
    const access = await openAttachmentForUser(userId.toHexString(), pdf!.id);
    check("attachment downloads for a member", access.ok && access.target.kind === "redirect");
    const stranger = await openAttachmentForUser(new Types.ObjectId().toHexString(), pdf!.id);
    check("attachment denied to a stranger", !stranger.ok);

    // 4. Reply through the sending service, then delivered/opened webhooks for it.
    const reply = await sendEmail(ctx, {
      senderId: sender.id,
      to: ["jane@customer.test"],
      subject: "Re: Invoice question",
      text: "It is on its way.",
      inReplyToEmailId: message.id,
    });
    const [sentToResend] = fakeSentEmails(key);
    check(
      "reply sent through Resend with threading headers",
      !!sentToResend?.input.headers?.["In-Reply-To"],
      JSON.stringify(sentToResend?.input.headers),
    );
    const replyDoc = await models.EmailModel.findById(reply.emailId);
    const eventData = {
      email_id: replyDoc!.resendId!,
      created_at: new Date().toISOString(),
      from: sender.address,
      to: ["jane@customer.test"],
      subject: "Re: Invoice question",
      tags: { mw_email: reply.emailId },
    };
    await webhookEvent("email.sent", eventData);
    await webhookEvent("email.delivered", eventData);
    await webhookEvent("email.opened", eventData);

    const after = await getThread(ctx, row!.id);
    const receipts = after.messages[1]?.receipts;
    check("thread now has our reply", after.messages.length === 2 && after.messageCount === 2);
    check(
      "read receipts: delivered then opened",
      receipts?.status === "opened" &&
        receipts.openCount === 1 &&
        receipts.events.map((e) => e.type).join() === "email.sent,email.delivered,email.opened",
      receipts?.events.map((e) => e.type).join(" > "),
    );
    const rollup = await models.MetricRollupModel.collection.findOne({
      orgId,
      granularity: "day",
      "dimension.kind": "all",
    });
    check(
      "metric rollups counted the events",
      rollup?.counts.sent === 1 &&
        rollup.counts.delivered === 1 &&
        rollup.counts.opened_total === 1 &&
        rollup.counts.received === 1,
      JSON.stringify(rollup?.counts),
    );

    console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
    await rm(fakeStorageRoot(), { recursive: true, force: true });
  } finally {
    await disconnectDb();
    await replSet.stop();
  }
}

main()
  .then(() => process.exit(failures === 0 ? 0 : 1))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
