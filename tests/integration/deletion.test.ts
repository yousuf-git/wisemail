import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { startTestDb } from "./helpers";
import {
  ctxFor,
  emailData,
  loadMail,
  seedOrg,
  storeEvent,
  type Mail,
  type Seed,
} from "./mail-helpers";

let stop: () => Promise<void>;
let m: Mail;
let purge: typeof import("@/lib/deletion/purge");
let tombstones: typeof import("@/lib/deletion/tombstones");
let trash: typeof import("@/lib/deletion/trash");
let bulk: typeof import("@/lib/deletion/bulk");
let retention: typeof import("@/lib/deletion/retention");
let rules: typeof import("@/lib/deletion/rules");
let connData: typeof import("@/lib/deletion/connection-data");
let connections: typeof import("@/lib/services/connections");

beforeAll(async () => {
  ({ stop } = await startTestDb("deletion"));
  m = await loadMail();
  purge = await import("@/lib/deletion/purge");
  tombstones = await import("@/lib/deletion/tombstones");
  trash = await import("@/lib/deletion/trash");
  bulk = await import("@/lib/deletion/bulk");
  retention = await import("@/lib/deletion/retention");
  rules = await import("@/lib/deletion/rules");
  connData = await import("@/lib/deletion/connection-data");
  connections = await import("@/lib/services/connections");
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

beforeEach(() => {
  m.fake.resetFakeResend();
  m.jobs.resetSentJobs();
  vi.restoreAllMocks();
});

let n = 0;
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

type EmailSeed = {
  direction?: "inbound" | "outbound";
  resendId?: string | null;
  threadId?: Types.ObjectId | null;
  createdAt?: Date;
  trashedAt?: Date | null;
  from?: string;
  subject?: string;
  tags?: { name: string; value: string }[];
  status?: string;
  connectionId?: Types.ObjectId;
  messageId?: string;
  files?: boolean;
};

/** An email with a body, a file and an R2 object for each, plus a webhook event. */
async function insertEmail(seed: Pick<Seed, "orgId" | "connectionId">, o: EmailSeed = {}) {
  const i = ++n;
  const connectionId = o.connectionId ?? seed.connectionId;
  const direction = o.direction ?? "inbound";
  const email = await m.models.EmailModel.create({
    orgId: seed.orgId,
    connectionId,
    resendId: o.resendId === undefined ? `em_del_${i}` : o.resendId,
    direction,
    origin: "external",
    threadId: o.threadId ?? null,
    messageId: o.messageId ?? `<msg${i}@customer.test>`,
    from: { address: o.from ?? "jane@customer.test" },
    to: [{ address: "support@x.test" }],
    recipientAddresses: ["support@x.test"],
    subject: o.subject ?? `Subject ${i}`,
    status: (o.status ?? (direction === "inbound" ? "received" : "sent")) as never,
    tags: o.tags ?? [],
    createdAt: o.createdAt ?? new Date(),
    trashedAt: o.trashedAt ?? null,
    purgeAt: o.trashedAt ? new Date(o.trashedAt.getTime() + 30 * DAY) : null,
  });
  // `createdAt` is managed by mongoose timestamps; force the requested one.
  if (o.createdAt) {
    await m.models.EmailModel.collection.updateOne(
      { _id: email._id },
      { $set: { createdAt: o.createdAt } },
    );
  }
  const keys: string[] = [];
  if (o.files !== false) {
    const rawKey = m.storage.storageKeys.inboundRaw(seed.orgId, email._id);
    const attId = new Types.ObjectId();
    const attKey = m.storage.storageKeys.inboundAttachment(seed.orgId, email._id, attId);
    await m.storage.getStore().put(rawKey, Buffer.from("raw"));
    await m.storage.getStore().put(attKey, Buffer.from("file"));
    await m.models.EmailContentModel.create({
      orgId: seed.orgId,
      emailId: email._id,
      html: "<p>hi</p>",
      rawStorageKey: rawKey,
    });
    await m.models.AttachmentModel.create({
      _id: attId,
      orgId: seed.orgId,
      emailId: email._id,
      direction: "inbound",
      filename: "a.pdf",
      contentType: "application/pdf",
      storageMode: "r2",
      storageKey: attKey,
    });
    keys.push(rawKey, attKey);
  }
  await m.models.WebhookEventModel.create({
    orgId: seed.orgId,
    connectionId,
    svixId: `msg_del_${i}_${Date.now()}`,
    type: "email.sent",
    occurredAt: new Date(),
    resendObjectId: email.resendId ?? "x",
    emailId: email._id,
    payload: {},
    processedAt: new Date(),
    expireAt: new Date(Date.now() + DAY),
  });
  return { email, keys };
}

async function insertThread(seed: Pick<Seed, "orgId" | "connectionId">, count = 1) {
  return m.models.ThreadModel.create({
    orgId: seed.orgId,
    connectionId: seed.connectionId,
    mailboxAddress: "support@x.test",
    subject: "Thread",
    subjectKey: "thread",
    participants: ["jane@customer.test"],
    messageCount: count,
    lastMessageAt: new Date(),
  });
}

const exists = (key: string) =>
  m.storage
    .getStore()
    .head(key)
    .then((h) => !!h);

describe("permanent delete", () => {
  it("deletes R2 objects before any document, then writes tombstones and cleans the thread", async () => {
    const seed = await seedOrg(m);
    const thread = await insertThread(seed, 1);
    const { email, keys } = await insertEmail(seed, { threadId: thread._id, resendId: "em_order" });
    const rollups = await m.models.MetricRollupModel.collection.countDocuments({});

    const store = m.storage.getStore();
    const realDelete = store.delete.bind(store);
    const seenAtR2Delete: { emails: number; contents: number; attachments: number }[] = [];
    vi.spyOn(store, "delete").mockImplementation(async (toDelete: string[]) => {
      // Documents must still be there when the objects go.
      seenAtR2Delete.push({
        emails: await m.models.EmailModel.countDocuments({ _id: email._id }),
        contents: await m.models.EmailContentModel.countDocuments({ emailId: email._id }),
        attachments: await m.models.AttachmentModel.countDocuments({ emailId: email._id }),
      });
      expect(toDelete.sort()).toEqual([...keys].sort());
      return realDelete(toDelete);
    });

    const result = await purge.purgeEmails(seed.orgId, [email._id], { reason: "user" });
    expect(result).toMatchObject({ deleted: 1, skipped: 0, files: 2, threads: 1 });
    expect(seenAtR2Delete).toEqual([{ emails: 1, contents: 1, attachments: 1 }]);

    for (const key of keys) expect(await exists(key)).toBe(false);
    expect(await m.models.EmailModel.countDocuments({ _id: email._id })).toBe(0);
    expect(await m.models.EmailContentModel.countDocuments({ emailId: email._id })).toBe(0);
    expect(await m.models.AttachmentModel.countDocuments({ emailId: email._id })).toBe(0);
    expect(await m.models.WebhookEventModel.countDocuments({ emailId: email._id })).toBe(0);
    expect(await m.models.ThreadModel.countDocuments({ _id: thread._id })).toBe(0);

    const stone = await m.models.DeletionTombstoneModel.findOne({
      connectionId: seed.connectionId,
      resendId: "em_order",
    }).lean();
    expect(stone).toMatchObject({ kind: "received_email", reason: "user" });
    expect(stone!.messageIdHash).toMatch(/^[0-9a-f]{64}$/);
    // Tombstones keep no subject, address or body.
    expect(JSON.stringify(stone)).not.toContain("customer.test");
    // Insights and usage are untouched.
    expect(await m.models.MetricRollupModel.collection.countDocuments({})).toBe(rollups);
  });

  it("keeps every document when R2 fails, so the next run can retry", async () => {
    const seed = await seedOrg(m);
    const { email, keys } = await insertEmail(seed, { resendId: "em_r2fail" });
    const store = m.storage.getStore();
    const spy = vi.spyOn(store, "delete").mockRejectedValueOnce(new Error("R2 unavailable"));

    await expect(purge.purgeEmails(seed.orgId, [email._id], { reason: "user" })).rejects.toThrow(
      "R2 unavailable",
    );
    expect(await m.models.EmailModel.countDocuments({ _id: email._id })).toBe(1);
    expect(await m.models.EmailContentModel.countDocuments({ emailId: email._id })).toBe(1);
    expect(await m.models.AttachmentModel.countDocuments({ emailId: email._id })).toBe(1);
    expect(await m.models.DeletionTombstoneModel.countDocuments({ resendId: "em_r2fail" })).toBe(0);
    for (const key of keys) expect(await exists(key)).toBe(true);

    spy.mockRestore();
    const retry = await purge.purgeEmails(seed.orgId, [email._id], { reason: "user" });
    expect(retry.deleted).toBe(1);
    for (const key of keys) expect(await exists(key)).toBe(false);
  });

  it("recomputes a thread that keeps other emails", async () => {
    const seed = await seedOrg(m);
    const thread = await insertThread(seed, 2);
    const a = await insertEmail(seed, { threadId: thread._id });
    await insertEmail(seed, { threadId: thread._id });
    await purge.purgeEmails(seed.orgId, [a.email._id], { reason: "user" });
    const fresh = await m.models.ThreadModel.findById(thread._id);
    expect(fresh!.messageCount).toBe(1);
  });

  it("cancels scheduled emails in Resend first and keeps one it cannot cancel", async () => {
    const seed = await seedOrg(m);
    const adapter = new m.fake.FakeResendAdapter(seed.key);
    const sentEmail = await adapter.sendEmail(
      {
        from: `support@${seed.domain.name}`,
        to: ["jane@customer.test"],
        subject: "Later",
        html: "<p>x</p>",
        scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      { idempotencyKey: `k-${seed.orgId}` },
    );
    const emailId = (sentEmail as { id: string }).id;
    const scheduled = await insertEmail(seed, {
      direction: "outbound",
      resendId: emailId,
      status: "scheduled",
      files: false,
    });
    const stuck = await insertEmail(seed, {
      direction: "outbound",
      resendId: "em_unknown_in_resend",
      status: "scheduled",
      files: false,
    });

    const result = await purge.purgeEmails(seed.orgId, [scheduled.email._id, stuck.email._id], {
      reason: "user",
    });
    expect(result).toMatchObject({ deleted: 1, skipped: 1 });
    expect(await m.models.EmailModel.countDocuments({ _id: scheduled.email._id })).toBe(0);
    expect(await m.models.EmailModel.countDocuments({ _id: stuck.email._id })).toBe(1);
  });

  it("permanentlyDeleteItems: Owner and Admin only, own org only, audited", async () => {
    const seed = await seedOrg(m);
    const other = await seedOrg(m);
    const mine = await insertEmail(seed, { trashedAt: new Date() });
    const theirs = await insertEmail(other, { trashedAt: new Date() });

    await expect(
      trash.permanentlyDeleteItems(ctxFor(m, seed.orgId, "developer"), {
        emailIds: [mine.email._id.toHexString()],
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      trash.permanentlyDeleteItems(ctxFor(m, seed.orgId, "support"), {
        emailIds: [mine.email._id.toHexString()],
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    const out = await trash.permanentlyDeleteItems(ctxFor(m, seed.orgId, "admin"), {
      emailIds: [mine.email._id.toHexString(), theirs.email._id.toHexString()],
    });
    expect(out.deleted).toBe(1);
    expect(await m.models.EmailModel.countDocuments({ _id: theirs.email._id })).toBe(1);
    expect(
      await m.models.AuditLogModel.countDocuments({
        orgId: seed.orgId,
        action: "mail.deleted_permanently",
      }),
    ).toBe(1);
  });

  it("deletes a whole conversation with every message", async () => {
    const seed = await seedOrg(m);
    const thread = await insertThread(seed, 2);
    await insertEmail(seed, { threadId: thread._id });
    await insertEmail(seed, { threadId: thread._id });
    const out = await trash.permanentlyDeleteItems(ctxFor(m, seed.orgId, "owner"), {
      threadIds: [thread._id.toHexString()],
    });
    expect(out.deleted).toBe(2);
    expect(await m.models.ThreadModel.countDocuments({ _id: thread._id })).toBe(0);
  });

  it("emptyTrash deletes inline up to 100, and asks for the typed count above that", async () => {
    const seed = await seedOrg(m);
    const kept = await insertEmail(seed, { files: false });
    for (let i = 0; i < 3; i++) await insertEmail(seed, { trashedAt: new Date(), files: false });
    const ctx = ctxFor(m, seed.orgId, "owner");
    expect(await trash.countTrash(ctx)).toBe(3);
    expect(await trash.emptyTrash(ctx)).toMatchObject({ mode: "done", deleted: 3 });
    expect(await m.models.EmailModel.countDocuments({ _id: kept.email._id })).toBe(1);
    expect(await trash.countTrash(ctx)).toBe(0);

    await m.models.EmailModel.insertMany(
      Array.from({ length: 130 }, (_, i) => ({
        orgId: seed.orgId,
        connectionId: seed.connectionId,
        resendId: `em_bulk_trash_${i}`,
        direction: "inbound",
        from: { address: "a@b.test" },
        status: "received",
        trashedAt: new Date(),
        purgeAt: new Date(Date.now() + DAY),
      })),
    );
    await expect(trash.emptyTrash(ctx, { confirmCount: 5 })).rejects.toMatchObject({
      code: "validation",
    });
    const started = await trash.emptyTrash(ctx, { confirmCount: 130 });
    expect(started.mode).toBe("job");
    expect(m.jobs.sentJobs.some((j) => j.name === "mail/bulk-delete.requested")).toBe(true);
  });
});

describe("tombstones keep deleted mail deleted", () => {
  it("a late open, a repeated send event and a re-delivered inbound never recreate the email", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const from = `Acme <hello@${seed.domain.name}>`;
    // A sent email known through its webhook.
    const sentId = await storeEvent(m, seed, "email.sent", emailData("em_late", { from }));
    await m.processing.processWebhookEvent(sentId);
    const sent = await m.models.EmailModel.findOne({
      connectionId: seed.connectionId,
      resendId: "em_late",
    });
    expect(sent).not.toBeNull();
    // A received email fetched for real.
    const inbound = m.fake.createFakeReceivedEmail(seed.key, {
      from: "Jane <jane@customer.test>",
      to: [seed.mailbox],
      subject: "Hi",
      text: "hello",
    });
    const rid = await storeEvent(m, seed, "email.received", inbound.event as never);
    const processed = await m.processing.processWebhookEvent(rid);
    await m.inbound.fetchInboundEmail({
      emailId: processed.fetchInbound!.emailId,
      orgId: processed.fetchInbound!.orgId,
    });

    const out = await purge.purgeEmails(
      seed.orgId,
      [sent!._id, new Types.ObjectId(processed.emailId!)],
      {
        reason: "bulk",
      },
    );
    expect(out.deleted).toBe(2);
    m.jobs.resetSentJobs();

    for (const type of ["email.opened", "email.delivered", "email.sent"] as const) {
      const id = await storeEvent(m, seed, type, emailData("em_late", { from }));
      expect(await m.processing.processWebhookEvent(id)).toMatchObject({
        found: true,
        ignoredReason: "deleted",
      });
    }
    // The same inbound announced again (Resend retries, replays).
    const again = await storeEvent(m, seed, "email.received", inbound.event as never);
    expect(await m.processing.processWebhookEvent(again)).toMatchObject({
      ignoredReason: "deleted",
    });
    expect(
      await m.models.EmailModel.countDocuments({
        connectionId: seed.connectionId,
        resendId: { $in: ["em_late", inbound.resendId] },
      }),
    ).toBe(0);
    expect(m.jobs.sentJobs.filter((j) => j.name === "email/inbound.fetch.requested")).toHaveLength(
      0,
    );
  });

  it("filters a synced page against tombstones (kind and connection aware)", async () => {
    const seed = await seedOrg(m);
    const other = await seedOrg(m);
    const gone = await insertEmail(seed, {
      resendId: "em_sync_gone",
      direction: "outbound",
      files: false,
    });
    await purge.purgeEmails(seed.orgId, [gone.email._id], { reason: "user" });
    const page = [{ id: "em_sync_gone" }, { id: "em_sync_new" }];
    expect(await tombstones.syncedEmailsToImport(seed.connectionId, "sent_email", page)).toEqual([
      { id: "em_sync_new" },
    ]);
    // Another kind or another connection is not affected.
    expect(
      await tombstones.syncedEmailsToImport(seed.connectionId, "received_email", page),
    ).toHaveLength(2);
    expect(
      await tombstones.syncedEmailsToImport(other.connectionId, "sent_email", page),
    ).toHaveLength(2);
    expect(
      await tombstones.isTombstoned({
        connectionId: seed.connectionId,
        kind: "sent_email",
        resendId: "em_sync_gone",
      }),
    ).toBe(true);
  });

  it("a reply to a deleted message starts a new thread (threading honors tombstones)", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const thread = await insertThread(seed, 1);
    const original = await insertEmail(seed, {
      threadId: thread._id,
      messageId: "<orig-1@customer.test>",
      files: false,
    });
    await purge.purgeEmails(seed.orgId, [original.email._id], { reason: "user" });
    const inbound = m.fake.createFakeReceivedEmail(seed.key, {
      from: "jane@customer.test",
      to: [seed.mailbox],
      subject: "Re: Thread",
      text: "following up",
      headers: { "In-Reply-To": "<orig-1@customer.test>", References: "<orig-1@customer.test>" },
    } as never);
    const id = await storeEvent(m, seed, "email.received", inbound.event as never);
    const processed = await m.processing.processWebhookEvent(id);
    await m.inbound.fetchInboundEmail({
      emailId: processed.fetchInbound!.emailId,
      orgId: processed.fetchInbound!.orgId,
    });
    const reply = await m.models.EmailModel.findById(processed.emailId);
    expect(reply!.threadId).not.toBeNull();
    expect(reply!.threadId!.equals(thread._id)).toBe(false);
  });
});

describe("purge-trash", () => {
  it("deletes only what has been in Trash for 30 days, with tombstones (trash_purge)", async () => {
    const seed = await seedOrg(m);
    const old = await insertEmail(seed, { trashedAt: ago(31), resendId: "em_old_trash" });
    const fresh = await insertEmail(seed, { trashedAt: ago(5) });
    const live = await insertEmail(seed);
    const summary = await retention.purgeExpiredTrash();
    expect(summary.emails).toBeGreaterThanOrEqual(1);
    expect(await m.models.EmailModel.countDocuments({ _id: old.email._id })).toBe(0);
    for (const key of old.keys) expect(await exists(key)).toBe(false);
    expect(await m.models.EmailModel.countDocuments({ _id: fresh.email._id })).toBe(1);
    expect(await m.models.EmailModel.countDocuments({ _id: live.email._id })).toBe(1);
    expect(
      await m.models.DeletionTombstoneModel.findOne({ resendId: "em_old_trash" }).lean(),
    ).toMatchObject({ reason: "trash_purge", deletedBy: null });
  });
});

describe("retention by plan", () => {
  it("Free keeps 30 days, Pro 180: same age, different outcome; files go first", async () => {
    const free = await seedOrg(m, { plan: "free" });
    const pro = await seedOrg(m, { plan: "pro" });
    const f60 = await insertEmail(free, { createdAt: ago(60) });
    const f10 = await insertEmail(free, { createdAt: ago(10) });
    const p60 = await insertEmail(pro, { createdAt: ago(60) });
    const p200 = await insertEmail(pro, { createdAt: ago(200) });

    const freeRun = await retention.applyOrgRetention(free.orgId);
    const proRun = await retention.applyOrgRetention(pro.orgId);
    expect(freeRun.emails).toBe(1);
    expect(proRun.emails).toBe(1);
    expect(await m.models.EmailModel.countDocuments({ _id: f60.email._id })).toBe(0);
    expect(await m.models.EmailModel.countDocuments({ _id: f10.email._id })).toBe(1);
    expect(await m.models.EmailModel.countDocuments({ _id: p60.email._id })).toBe(1);
    expect(await m.models.EmailModel.countDocuments({ _id: p200.email._id })).toBe(0);
    for (const key of [...f60.keys, ...p200.keys]) expect(await exists(key)).toBe(false);
    for (const key of [...f10.keys, ...p60.keys]) expect(await exists(key)).toBe(true);
    // Retention leaves no tombstone (sync never imports mail older than the window).
    expect(
      await m.models.DeletionTombstoneModel.countDocuments({ resendId: f60.email.resendId! }),
    ).toBe(0);
  });

  it("honors a retention override on the org", async () => {
    const seed = await seedOrg(m, { plan: "free" });
    await m.models.OrgSettingsModel.updateOne(
      { orgId: seed.orgId },
      { $set: { "limitOverrides.retentionDays": 90 } },
    );
    const e = await insertEmail(seed, { createdAt: ago(60) });
    expect((await retention.applyOrgRetention(seed.orgId)).emails).toBe(0);
    expect(await m.models.EmailModel.countDocuments({ _id: e.email._id })).toBe(1);
  });

  it("removes expired bodies and files whose email a TTL already dropped, objects first", async () => {
    const seed = await seedOrg(m);
    const { email, keys } = await insertEmail(seed);
    // Simulate the email TTL: the email is gone, its content and file stay behind, expired.
    await m.models.EmailModel.collection.deleteOne({ _id: email._id });
    await m.models.EmailContentModel.updateMany(
      { emailId: email._id },
      { $set: { expireAt: ago(1) } },
    );
    await m.models.AttachmentModel.updateMany(
      { emailId: email._id },
      { $set: { expireAt: ago(1) } },
    );
    // A live email with an expired-looking file must not be touched.
    const live = await insertEmail(seed);
    await m.models.AttachmentModel.updateMany(
      { emailId: live.email._id },
      { $set: { expireAt: ago(1) } },
    );

    const out = await retention.sweepExpiredOrphans();
    expect(out.orphans).toBe(2);
    for (const key of keys) expect(await exists(key)).toBe(false);
    for (const key of live.keys) expect(await exists(key)).toBe(true);
    expect(await m.models.AttachmentModel.countDocuments({ emailId: live.email._id })).toBe(1);
  });
});

describe("bulk operations", () => {
  async function bulkSeed(count: number, extra: Record<string, unknown> = {}) {
    const seed = await seedOrg(m);
    const from = new Date(Date.now() - 3600_000);
    await m.models.EmailModel.insertMany(
      Array.from({ length: count }, (_, i) => ({
        orgId: seed.orgId,
        connectionId: seed.connectionId,
        resendId: `em_b_${seed.orgId}_${i}`,
        direction: "inbound",
        from: { address: "no-reply@github.com" },
        subject: "Notification",
        status: "received",
        createdAt: from,
        ...extra,
      })),
    );
    return seed;
  }

  it("trashes 'all matching' in batches of 500, reports progress and undoes by operation", async () => {
    const seed = await bulkSeed(1250);
    const ctx = ctxFor(m, seed.orgId, "admin");
    const filter = { source: "activity", filters: { q: "" } } as const;
    expect(await bulk.countMatching(ctx, filter)).toBe(1250);

    const op = await bulk.startBulkOperation(ctx, { action: "trash", filter });
    expect(op).toMatchObject({ status: "queued", total: 1250, processed: 0 });
    expect(m.jobs.sentJobs.filter((j) => j.name === "mail/bulk-delete.requested")).toHaveLength(1);

    const steps = [];
    for (;;) {
      const step = await bulk.runBulkStep(op.id);
      steps.push(step);
      if (step.done) break;
    }
    expect(steps.map((s) => s.processed)).toEqual([500, 1000, 1250]);
    const done = await bulk.getBulkOperation(ctx, op.id);
    expect(done).toMatchObject({ status: "done", processed: 1250, undoable: true });
    expect(await m.models.EmailModel.countDocuments({ orgId: seed.orgId, trashedAt: null })).toBe(
      0,
    );
    expect(
      await m.models.AuditLogModel.countDocuments({
        orgId: seed.orgId,
        action: "mail.bulk_trashed",
      }),
    ).toBe(1);

    // Undo restores exactly what that operation moved, again in the background.
    const undo = await bulk.startBulkOperation(ctx, {
      action: "restore",
      filter: { source: "operation", opId: op.id },
    });
    expect(undo.total).toBe(1250);
    await bulk.runBulkToCompletion(undo.id);
    expect(await m.models.EmailModel.countDocuments({ orgId: seed.orgId, trashedAt: null })).toBe(
      1250,
    );
  });

  it("a duplicate run of the same step never counts a batch twice or trashes twice", async () => {
    const seed = await bulkSeed(600);
    const ctx = ctxFor(m, seed.orgId, "admin");
    const op = await bulk.startBulkOperation(ctx, {
      action: "trash",
      filter: { source: "activity", filters: {} },
    });
    expect(op.status).toBe("queued");
    // Two workers pick up the same step at once (an Inngest retry racing the original).
    const both = await Promise.all([bulk.runBulkStep(op.id), bulk.runBulkStep(op.id)]);
    expect(both.every((s) => !s.done)).toBe(true);
    expect((await m.models.BulkOperationModel.findById(op.id))!.processed).toBe(500);
    const rest = await bulk.runBulkToCompletion(op.id);
    expect(rest).toMatchObject({ done: true, processed: 600, total: 600 });
    expect(
      await m.models.EmailModel.countDocuments({ orgId: seed.orgId, trashedAt: { $ne: null } }),
    ).toBe(600);
    expect(
      await m.models.AuditLogModel.countDocuments({
        orgId: seed.orgId,
        action: "mail.bulk_trashed",
      }),
    ).toBe(1);
    // A finished operation is a no-op, and a crash-retry after the work was applied just finishes.
    await m.models.BulkOperationModel.updateOne(
      { _id: op.id },
      { $set: { status: "running", cursor: null, processed: 0 }, $unset: { finishedAt: 1 } },
    );
    expect((await bulk.runBulkStep(op.id)).done).toBe(true);
    expect((await bulk.runBulkStep(op.id)).done).toBe(true);
    expect(
      await m.models.AuditLogModel.countDocuments({
        orgId: seed.orgId,
        action: "mail.bulk_trashed",
      }),
    ).toBe(2);
  });

  it("leaves out mail that arrives after the request (cap time)", async () => {
    const seed = await bulkSeed(150);
    const ctx = ctxFor(m, seed.orgId, "owner");
    const op = await bulk.startBulkOperation(ctx, {
      action: "trash",
      filter: { source: "activity", filters: {} },
    });
    await m.models.EmailModel.create({
      orgId: seed.orgId,
      connectionId: seed.connectionId,
      resendId: "em_late_arrival",
      direction: "inbound",
      from: { address: "no-reply@github.com" },
      status: "received",
      createdAt: new Date(Date.now() + 5_000),
    });
    await bulk.runBulkToCompletion(op.id);
    expect(
      (await m.models.EmailModel.findOne({ resendId: "em_late_arrival" }))!.trashedAt,
    ).toBeNull();
    expect(
      await m.models.EmailModel.countDocuments({ orgId: seed.orgId, trashedAt: { $ne: null } }),
    ).toBe(150);
  });

  it("permanent bulk delete needs the typed count and Owner/Admin", async () => {
    const seed = await bulkSeed(130);
    const filter = { source: "activity", filters: {} } as const;
    await expect(
      bulk.startBulkOperation(ctxFor(m, seed.orgId, "developer"), {
        action: "delete",
        filter,
        confirmCount: 130,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const ctx = ctxFor(m, seed.orgId, "owner");
    await expect(
      bulk.startBulkOperation(ctx, { action: "delete", filter, confirmCount: 129 }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(await m.models.EmailModel.countDocuments({ orgId: seed.orgId })).toBe(130);

    const op = await bulk.startBulkOperation(ctx, { action: "delete", filter, confirmCount: 130 });
    await bulk.runBulkToCompletion(op.id);
    expect(await m.models.EmailModel.countDocuments({ orgId: seed.orgId })).toBe(0);
    expect(
      await m.models.DeletionTombstoneModel.countDocuments({ orgId: seed.orgId, reason: "bulk" }),
    ).toBe(130);
    expect(
      await m.models.AuditLogModel.countDocuments({
        orgId: seed.orgId,
        action: "mail.bulk_deleted",
      }),
    ).toBe(1);
    // Nothing left to undo.
    await expect(
      bulk.startBulkOperation(ctx, {
        action: "restore",
        filter: { source: "operation", opId: op.id },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("small selections run inline; other orgs' operations are invisible", async () => {
    const seed = await bulkSeed(5);
    const other = await bulkSeed(5);
    const ctx = ctxFor(m, seed.orgId, "owner");
    const op = await bulk.startBulkOperation(ctx, {
      action: "trash",
      filter: { source: "activity", filters: {} },
    });
    expect(op).toMatchObject({ status: "done", processed: 5 });
    expect(m.jobs.sentJobs).toHaveLength(0);
    expect(await m.models.EmailModel.countDocuments({ orgId: other.orgId, trashedAt: null })).toBe(
      5,
    );
    await expect(
      bulk.getBulkOperation(ctxFor(m, other.orgId, "owner"), op.id),
    ).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("respects project scope: a scoped member only selects their projects", async () => {
    const projectA = new Types.ObjectId();
    const projectB = new Types.ObjectId();
    const seed = await seedOrg(m);
    await m.models.EmailModel.insertMany(
      [projectA, projectB, projectB].map((projectId, i) => ({
        orgId: seed.orgId,
        connectionId: seed.connectionId,
        resendId: `em_scope_${i}_${seed.orgId}`,
        direction: "inbound",
        from: { address: "a@b.test" },
        status: "received",
        projectId,
      })),
    );
    const scoped = ctxFor(m, seed.orgId, "support", { projectScope: [projectA.toHexString()] });
    expect(await bulk.countMatching(scoped, { source: "activity", filters: {} })).toBe(1);
    const op = await bulk.startBulkOperation(scoped, {
      action: "trash",
      filter: { source: "activity", filters: {} },
    });
    expect(op.total).toBe(1);
    expect(await m.models.EmailModel.countDocuments({ orgId: seed.orgId, trashedAt: null })).toBe(
      2,
    );
  });

  it("trashes conversations from the inbox filter, including their emails", async () => {
    const seed = await seedOrg(m);
    const t1 = await insertThread(seed, 2);
    await insertEmail(seed, { threadId: t1._id, files: false });
    await insertEmail(seed, { threadId: t1._id, files: false });
    const ctx = ctxFor(m, seed.orgId, "support");
    const op = await bulk.startBulkOperation(ctx, {
      action: "trash",
      filter: { source: "inbox" },
    });
    expect(op).toMatchObject({ status: "done", total: 1 });
    expect((await m.models.ThreadModel.findById(t1._id))!.trashedAt).toBeInstanceOf(Date);
    expect(
      await m.models.EmailModel.countDocuments({ threadId: t1._id, trashedAt: { $ne: null } }),
    ).toBe(2);
    // Viewers cannot trash.
    await expect(
      bulk.startBulkOperation(ctxFor(m, seed.orgId, "viewer"), {
        action: "trash",
        filter: { source: "inbox" },
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("cleanup rules", () => {
  const rule = (extra: Record<string, unknown> = {}) => ({
    name: "GitHub noise",
    action: "trash" as const,
    match: { fromDomain: "github.com", olderThanDays: 30 },
    ...extra,
  });

  it("selects by age, sender domain, subject, tag, direction and scope", async () => {
    const seed = await seedOrg(m);
    const other = await seedOrg(m);
    const hit = await insertEmail(seed, {
      from: "no-reply@github.com",
      createdAt: ago(45),
      files: false,
    });
    const young = await insertEmail(seed, {
      from: "no-reply@github.com",
      createdAt: ago(3),
      files: false,
    });
    const otherSender = await insertEmail(seed, {
      from: "a@gitlab.com",
      createdAt: ago(45),
      files: false,
    });
    const otherOrg = await insertEmail(other, {
      from: "no-reply@github.com",
      createdAt: ago(45),
      files: false,
    });
    const ctx = ctxFor(m, seed.orgId, "developer");

    expect((await rules.previewCleanupRule(ctx, rule())).count).toBe(1);
    expect(
      (
        await rules.previewCleanupRule(
          ctx,
          rule({ match: { subjectContains: "subject", olderThanDays: 30 } }),
        )
      ).count,
    ).toBe(2);
    const tagged = await insertEmail(seed, {
      tags: [{ name: "type", value: "digest" }],
      createdAt: ago(40),
      files: false,
    });
    expect(
      (
        await rules.previewCleanupRule(
          ctx,
          rule({ match: { tag: { name: "type", value: "digest" }, olderThanDays: 30 } }),
        )
      ).count,
    ).toBe(1);
    expect(
      (
        await rules.previewCleanupRule(
          ctx,
          rule({ match: { direction: "outbound", olderThanDays: 1 } }),
        )
      ).count,
    ).toBe(0);
    expect(
      (
        await rules.previewCleanupRule(
          ctx,
          rule({ scope: { connectionIds: [new Types.ObjectId().toHexString()] } }),
        )
      ).count,
    ).toBe(0);

    const created = await rules.createCleanupRule(ctx, rule());
    const run = await rules.runCleanupRuleById(created.id);
    expect(run.affected).toBe(1);
    expect((await m.models.EmailModel.findById(hit.email._id))!.trashedAt).toBeInstanceOf(Date);
    expect(
      (await m.models.EmailModel.findById(hit.email._id))!.trashedByRuleId?.toHexString(),
    ).toBe(created.id);
    for (const e of [young, otherSender, tagged]) {
      expect((await m.models.EmailModel.findById(e.email._id))!.trashedAt).toBeNull();
    }
    expect((await m.models.EmailModel.findById(otherOrg.email._id))!.trashedAt).toBeNull();
    // Second run finds nothing new; the counters are recorded.
    expect((await rules.runCleanupRuleById(created.id)).affected).toBe(0);
    const stored = await m.models.CleanupRuleModel.findById(created.id);
    expect(stored!.lastRunAt).toBeInstanceOf(Date);
  });

  it("the delete action is permanent, tombstoned, and needs cleanupRule:manageDelete", async () => {
    const seed = await seedOrg(m);
    const dev = ctxFor(m, seed.orgId, "developer");
    const admin = ctxFor(m, seed.orgId, "admin");
    await expect(rules.createCleanupRule(dev, rule({ action: "delete" }))).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      rules.createCleanupRule(ctxFor(m, seed.orgId, "support"), rule()),
    ).rejects.toMatchObject({ code: "forbidden" });

    const created = await rules.createCleanupRule(admin, rule({ action: "delete" }));
    // A developer can neither edit, toggle nor remove a delete rule, nor turn a rule into one.
    await expect(
      rules.updateCleanupRule(dev, created.id, rule({ action: "trash" })),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(rules.setCleanupRuleEnabled(dev, created.id, false)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(rules.deleteCleanupRule(dev, created.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    const safe = await rules.createCleanupRule(dev, rule({ name: "safe" }));
    await expect(
      rules.updateCleanupRule(dev, safe.id, rule({ action: "delete" })),
    ).rejects.toMatchObject({
      code: "forbidden",
    });

    const victim = await insertEmail(seed, {
      from: "no-reply@github.com",
      createdAt: ago(60),
      resendId: "em_rule_del",
    });
    const run = await rules.runCleanupRuleById(created.id);
    expect(run.affected).toBe(1);
    expect(await m.models.EmailModel.countDocuments({ _id: victim.email._id })).toBe(0);
    for (const key of victim.keys) expect(await exists(key)).toBe(false);
    expect(
      await m.models.DeletionTombstoneModel.findOne({ resendId: "em_rule_del" }),
    ).toMatchObject({ reason: "rule" });

    const audits = await m.models.AuditLogModel.find({ orgId: seed.orgId }).lean();
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(["cleanup_rule.created", "cleanup_rule.deleted_mail"]),
    );
  });

  it("validates: age is required for rules, block_sender needs a sender and goes to Trash", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId, "admin");
    await expect(
      rules.createCleanupRule(ctx, { name: "x", action: "trash", match: { fromDomain: "a.com" } }),
    ).rejects.toThrow();
    await expect(
      rules.createCleanupRule(ctx, { name: "x", kind: "block_sender", action: "trash", match: {} }),
    ).rejects.toThrow();
    await expect(
      rules.createCleanupRule(ctx, {
        name: "x",
        kind: "block_sender",
        action: "delete",
        match: { fromAddress: "spam@bad.test" },
      }),
    ).rejects.toThrow();
    const block = await rules.createCleanupRule(ctx, {
      name: "Block spam",
      kind: "block_sender",
      action: "trash",
      match: { fromAddress: "Spam@Bad.test" },
    });
    expect(block.match.fromAddress).toBe("spam@bad.test");
    expect(await rules.listRunnableRuleIds()).not.toContain(block.id);
    expect(await rules.blockedSender(seed.orgId, { fromAddress: "spam@bad.test" })).not.toBeNull();
    expect(await rules.blockedSender(seed.orgId, { fromAddress: "ok@good.test" })).toBeNull();
  });

  it("block_sender puts mail from that sender straight into Trash on arrival, others land normally", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const block = await rules.createCleanupRule(ctxFor(m, seed.orgId, "admin"), {
      name: "Block spam",
      kind: "block_sender",
      action: "trash",
      match: { fromAddress: "spam@bad.test" },
    });
    const receive = async (from: string) => {
      const inbound = m.fake.createFakeReceivedEmail(seed.key, {
        from,
        to: [seed.mailbox],
        subject: `From ${from}`,
        text: "hello",
      });
      const id = await storeEvent(m, seed, "email.received", inbound.event as never);
      const processed = await m.processing.processWebhookEvent(id);
      await m.inbound.fetchInboundEmail({
        emailId: processed.fetchInbound!.emailId,
        orgId: processed.fetchInbound!.orgId,
      });
      return m.models.EmailModel.findById(processed.emailId);
    };
    const blocked = await receive("Spammer <spam@bad.test>");
    expect(blocked!.trashedAt).toBeInstanceOf(Date);
    expect(blocked!.trashedByRuleId!.toHexString()).toBe(block.id);
    expect(blocked!.purgeAt).toBeInstanceOf(Date);
    expect((await m.models.ThreadModel.findById(blocked!.threadId))!.messageCount).toBe(0);
    expect(await m.models.NotificationModel.countDocuments({ orgId: seed.orgId })).toBe(0);
    const ok = await receive("Jane <jane@good.test>");
    expect(ok!.trashedAt).toBeNull();
    expect((await m.models.ThreadModel.findById(ok!.threadId))!.messageCount).toBe(1);
  });

  it("archive rules archive the conversation once", async () => {
    const seed = await seedOrg(m);
    const thread = await insertThread(seed);
    await insertEmail(seed, {
      threadId: thread._id,
      from: "no-reply@github.com",
      createdAt: ago(45),
      files: false,
    });
    const created = await rules.createCleanupRule(
      ctxFor(m, seed.orgId, "admin"),
      rule({ action: "archive" }),
    );
    expect((await rules.runCleanupRuleById(created.id)).affected).toBe(1);
    expect((await m.models.ThreadModel.findById(thread._id))!.archived).toBe(true);
    expect((await rules.runCleanupRuleById(created.id)).affected).toBe(0);
  });

  it("a disabled rule never runs", async () => {
    const seed = await seedOrg(m);
    const e = await insertEmail(seed, {
      from: "no-reply@github.com",
      createdAt: ago(45),
      files: false,
    });
    const created = await rules.createCleanupRule(
      ctxFor(m, seed.orgId, "admin"),
      rule({ enabled: false }),
    );
    expect(await rules.listRunnableRuleIds()).not.toContain(created.id);
    expect((await rules.runCleanupRuleById(created.id)).affected).toBe(0);
    expect((await m.models.EmailModel.findById(e.email._id))!.trashedAt).toBeNull();
  });
});

describe("connection data deletion", () => {
  async function secondConnection(seed: Seed) {
    const connectionId = new Types.ObjectId();
    await m.models.ConnectionModel.create({
      _id: connectionId,
      orgId: seed.orgId,
      name: `conn-${connectionId}`,
      resendTeamFingerprint: `fp-${connectionId}`,
      createdBy: new Types.ObjectId(),
      status: "active",
    });
    return connectionId;
  }
  const mirrors = (orgId: Types.ObjectId, connectionId: Types.ObjectId) => ({
    orgId,
    connectionId,
    resendId: `r_${new Types.ObjectId()}`,
  });

  it("erases one connection's mirrors and mail, nothing of the org's other connection or other orgs", async () => {
    const a = await seedOrg(m);
    const b = await seedOrg(m);
    const a2 = await secondConnection(a);

    const target = await insertEmail(a, { connectionId: a.connectionId });
    const sibling = await insertEmail(a, { connectionId: a2 });
    const foreign = await insertEmail(b);
    const thread = await insertThread(a, 1);
    await m.models.EmailModel.updateOne(
      { _id: target.email._id },
      { $set: { threadId: thread._id } },
    );
    await m.models.SegmentModel.create({ ...mirrors(a.orgId, a.connectionId), name: "S" });
    await m.models.SegmentModel.create({ ...mirrors(a.orgId, a2), name: "S2" });
    await m.models.SegmentModel.create({ ...mirrors(b.orgId, b.connectionId), name: "S3" });
    await m.models.ContactModel.create({ ...mirrors(a.orgId, a.connectionId), email: "c@x.test" });
    await m.models.ContactModel.create({ ...mirrors(a.orgId, a2), email: "d@x.test" });
    await m.models.MetricRollupModel.collection.insertOne({
      orgId: a.orgId,
      connectionId: a.connectionId,
      granularity: "day",
      counts: { sent: 3 },
    });

    const result = await connData.runConnectionDataToCompletion({
      connectionId: a.connectionId.toHexString(),
      orgId: a.orgId.toHexString(),
    });
    expect(result.emails).toBe(1);

    expect(await m.models.EmailModel.countDocuments({ _id: target.email._id })).toBe(0);
    for (const key of target.keys) expect(await exists(key)).toBe(false);
    expect(await m.models.ThreadModel.countDocuments({ _id: thread._id })).toBe(0);
    expect(
      await m.models.DomainModel.countDocuments({ orgId: a.orgId, connectionId: a.connectionId }),
    ).toBe(0);
    expect(
      await m.models.SegmentModel.countDocuments({ orgId: a.orgId, connectionId: a.connectionId }),
    ).toBe(0);
    expect(
      await m.models.ContactModel.countDocuments({ orgId: a.orgId, connectionId: a.connectionId }),
    ).toBe(0);
    expect(await m.models.WebhookEventModel.countDocuments({ connectionId: a.connectionId })).toBe(
      0,
    );

    // Untouched: the same org's other connection, another org, rollups, tombstones not written.
    expect(await m.models.EmailModel.countDocuments({ _id: sibling.email._id })).toBe(1);
    for (const key of sibling.keys) expect(await exists(key)).toBe(true);
    expect(await m.models.EmailModel.countDocuments({ _id: foreign.email._id })).toBe(1);
    for (const key of foreign.keys) expect(await exists(key)).toBe(true);
    expect(await m.models.SegmentModel.countDocuments({ connectionId: a2 })).toBe(1);
    expect(await m.models.SegmentModel.countDocuments({ orgId: b.orgId })).toBe(1);
    expect(await m.models.ContactModel.countDocuments({ connectionId: a2 })).toBe(1);
    expect(await m.models.DomainModel.countDocuments({ orgId: b.orgId })).toBe(1);
    expect(await m.models.MetricRollupModel.collection.countDocuments({ orgId: a.orgId })).toBe(1);
    expect(await m.models.DeletionTombstoneModel.countDocuments({ orgId: a.orgId })).toBe(0);
    expect(
      await m.models.AuditLogModel.countDocuments({
        orgId: a.orgId,
        action: "connection.data_deleted",
      }),
    ).toBe(1);
  });

  it("a connection id from another org deletes nothing", async () => {
    const a = await seedOrg(m);
    const b = await seedOrg(m);
    const e = await insertEmail(b);
    await connData.runConnectionDataToCompletion({
      connectionId: b.connectionId.toHexString(),
      orgId: a.orgId.toHexString(),
    });
    expect(await m.models.EmailModel.countDocuments({ _id: e.email._id })).toBe(1);
    expect(await m.models.DomainModel.countDocuments({ orgId: b.orgId })).toBe(1);
  });

  it("removeConnection: keeps data by default, and 'delete' needs the typed word and queues the job", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId, "owner");
    const conn = await m.models.ConnectionModel.findById(seed.connectionId);
    await expect(
      connections.removeConnection(ctx, {
        connectionId: seed.connectionId.toHexString(),
        confirmName: conn!.name,
        deleteSyncedData: true,
        confirmDelete: "nope",
      }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(m.jobs.sentJobs).toHaveLength(0);

    const other = await seedOrg(m);
    const otherConn = await m.models.ConnectionModel.findById(other.connectionId);
    const kept = await connections.removeConnection(ctxFor(m, other.orgId, "owner"), {
      connectionId: other.connectionId.toHexString(),
      confirmName: otherConn!.name,
    });
    expect(kept.data).toBe("kept");
    expect(m.jobs.sentJobs).toHaveLength(0);
    expect(await m.models.DomainModel.countDocuments({ orgId: other.orgId })).toBe(1);

    const queued = await connections.removeConnection(ctx, {
      connectionId: seed.connectionId.toHexString(),
      confirmName: conn!.name,
      deleteSyncedData: true,
      confirmDelete: "DELETE",
    });
    expect(queued.data).toBe("queued");
    expect(m.jobs.sentJobs).toEqual([
      {
        name: "connection/data-delete.requested",
        data: expect.objectContaining({
          connectionId: seed.connectionId.toHexString(),
          orgId: seed.orgId.toHexString(),
        }),
      },
    ]);
    // The connection itself is soft deleted at once; the data goes with the job.
    expect((await m.models.ConnectionModel.findById(seed.connectionId))!.deletedAt).toBeInstanceOf(
      Date,
    );
    expect(await m.models.DomainModel.countDocuments({ orgId: seed.orgId })).toBe(1);
    await connData.runConnectionDataToCompletion({
      connectionId: seed.connectionId.toHexString(),
      orgId: seed.orgId.toHexString(),
    });
    expect(await m.models.DomainModel.countDocuments({ orgId: seed.orgId })).toBe(0);
  });
});
