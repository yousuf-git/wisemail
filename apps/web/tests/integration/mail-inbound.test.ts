import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { startTestDb } from "./helpers";
import {
  ctxFor,
  loadMail,
  seedOrg,
  storeEvent,
  tinyPng,
  type Mail,
  type Seed,
} from "./mail-helpers";

let stop: () => Promise<void>;
let m: Mail;

beforeAll(async () => {
  ({ stop } = await startTestDb("mail-inbound"));
  m = await loadMail();
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

beforeEach(() => {
  m.fake.resetFakeResend();
  m.jobs.resetSentJobs();
});

/** email.received webhook -> process-event -> fetch-inbound, as the jobs run it. */
async function receive(
  seed: Seed,
  input: Parameters<Mail["fake"]["createFakeReceivedEmail"]>[1],
  at = new Date(),
) {
  const inbound = m.fake.createFakeReceivedEmail(seed.key, input);
  const eventId = await storeEvent(m, seed, "email.received", inbound.event as never, at);
  const processed = await m.processing.processWebhookEvent(eventId);
  const fetched = processed.fetchInbound
    ? await m.inbound.fetchInboundEmail({
        emailId: processed.fetchInbound.emailId,
        orgId: processed.fetchInbound.orgId,
      })
    : null;
  return { inbound, processed, fetched, emailId: processed.emailId! };
}

describe("fetch-inbound (paid plan: files in our storage)", () => {
  it("stores raw MIME and attachments, sanitizes, threads and updates the thread", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const { inbound, fetched, emailId } = await receive(seed, {
      from: "Jane Doe <jane@customer.test>",
      to: [seed.mailbox],
      cc: ["bob@customer.test"],
      subject: "Invoice question",
      text: "Where is my invoice?",
      html: `<p onclick="steal()">Where is my <b>invoice</b>?</p><script>alert(1)</script><img src="cid:logo1"><img src="http://cdn.test/p.png">`,
      attachments: [
        {
          filename: "Rechnung März ✓.pdf",
          contentType: "application/pdf",
          content: Buffer.from("%PDF-1.4 fake"),
        },
        { filename: "logo.png", contentType: "image/png", content: tinyPng, contentId: "logo1" },
        { filename: "extra.png", contentType: "image/png", content: tinyPng, contentId: "unused" },
      ],
    });
    expect(fetched).toMatchObject({ status: "ready", attachments: 3 });

    const email = await m.models.EmailModel.findById(emailId);
    expect(email).toMatchObject({
      contentStatus: "ready",
      hasAttachments: true,
      subject: "Invoice question",
      messageId: inbound.messageId,
    });
    expect(email!.threadId).toBeTruthy();

    // Body: sanitized, cid references kept, http image upgraded, raw MIME in storage.
    const content = await m.models.EmailContentModel.findOne({ emailId });
    expect(content!.html).not.toMatch(/<script|onclick/i);
    expect(content!.html).toContain("cid:logo1");
    expect(content!.html).toContain("https://cdn.test/p.png");
    expect(content!.text).toContain("Where is my invoice?");
    expect(content!.rawStorageKey).toBe(`orgs/${seed.orgId}/inbound/${emailId}/raw.eml`);
    const raw = await m.storage.getStore().get(content!.rawStorageKey!);
    expect(raw!.body.toString()).toContain("Subject: Invoice question");
    expect(content!.headers.some((h) => h.name?.toLowerCase() === "message-id")).toBe(true);

    // Attachments: exact filename, objects stored, embedded flag from the HTML.
    const attachments = await m.models.AttachmentModel.find({ emailId }).sort({ filename: 1 });
    expect(attachments).toHaveLength(3);
    const pdf = attachments.find((a) => a.contentType === "application/pdf")!;
    expect(pdf).toMatchObject({
      filename: "Rechnung März ✓.pdf",
      storageMode: "r2",
      embedded: false,
      direction: "inbound",
      availability: "available",
    });
    expect(pdf.storageKey).toBe(`orgs/${seed.orgId}/inbound/${emailId}/att/${pdf._id}`);
    expect((await m.storage.getStore().get(pdf.storageKey!))!.body.toString()).toBe(
      "%PDF-1.4 fake",
    );
    expect(attachments.find((a) => a.contentId === "logo1")!.embedded).toBe(true);
    expect(attachments.find((a) => a.contentId === "unused")!.embedded).toBe(false);
    expect(pdf.expireAt).toBeInstanceOf(Date);

    // Thread: caches, participants exclude our own domain.
    const thread = await m.models.ThreadModel.findById(email!.threadId);
    expect(thread).toMatchObject({
      subject: "Invoice question",
      mailboxAddress: seed.mailbox,
      messageCount: 1,
      snippet: "Where is my invoice?",
      hasAttachments: true,
    });
    expect(thread!.participants.sort()).toEqual(["bob@customer.test", "jane@customer.test"]);
    expect(thread!.lastInboundAt).toBeInstanceOf(Date);
    expect(thread!.lastOutboundAt).toBeUndefined();
  });

  it("threads a follow-up by References, and a reply of ours by In-Reply-To", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const ctx = ctxFor(m, seed.orgId, "support");
    const first = await receive(seed, {
      from: "jane@customer.test",
      to: [seed.mailbox],
      subject: "Invoice question",
      text: "first",
    });
    const threadId = (await m.models.EmailModel.findById(first.emailId))!.threadId!;

    // Our reply through the sending service...
    const sent = await m.sending.sendEmail(ctx, {
      senderId: seed.sender._id.toHexString(),
      to: ["jane@customer.test"],
      subject: "Re: Invoice question",
      text: "On it",
      inReplyToEmailId: first.emailId,
    });
    expect(sent.threadId).toBe(threadId.toHexString());
    const ours = await m.models.EmailModel.findById(sent.emailId);
    expect(ours!.messageId).toMatch(/^<em_fake_/);

    // ...and the customer answers our message with a different subject.
    const second = await receive(seed, {
      from: "jane@customer.test",
      to: [seed.mailbox],
      subject: "Totally different subject",
      text: "thanks",
      inReplyTo: ours!.messageId!,
      references: [first.inbound.messageId, ours!.messageId!],
    });
    expect((await m.models.EmailModel.findById(second.emailId))!.threadId!.equals(threadId)).toBe(
      true,
    );
    const thread = await m.models.ThreadModel.findById(threadId);
    expect(thread).toMatchObject({ messageCount: 3, snippet: "thanks" });
    expect(thread!.lastOutboundAt).toBeInstanceOf(Date);

    // A reply to a conversation we took part in counts as `replied`.
    const replied = await m.models.MetricRollupModel.collection.findOne({
      orgId: seed.orgId,
      granularity: "day",
      "dimension.kind": "all",
    });
    expect(replied!.counts.replied).toBe(1);

    // Same subject, same person, no headers: falls back to the subject within 14 days.
    const third = await receive(seed, {
      from: "jane@customer.test",
      to: [seed.mailbox],
      subject: "RE: Invoice question",
      text: "one more thing",
    });
    expect((await m.models.EmailModel.findById(third.emailId))!.threadId!.equals(threadId)).toBe(
      true,
    );
    // Unrelated mail starts its own thread.
    const other = await receive(seed, {
      from: "someone@else.test",
      to: [seed.mailbox],
      subject: "Hello there",
      text: "x",
    });
    expect((await m.models.EmailModel.findById(other.emailId))!.threadId!.equals(threadId)).toBe(
      false,
    );
  });

  it("is idempotent and safe to retry", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const { processed, emailId } = await receive(seed, {
      from: "jane@customer.test",
      to: [seed.mailbox],
      subject: "Once",
      text: "x",
      attachments: [{ filename: "a.txt", contentType: "text/plain", content: "hello" }],
    });
    const again = await m.inbound.fetchInboundEmail({ emailId });
    expect(again).toEqual({ status: "skipped", reason: "already_ready" });
    expect(await m.models.AttachmentModel.countDocuments({ emailId })).toBe(1);
    expect(await m.models.ThreadModel.countDocuments({ orgId: seed.orgId })).toBe(1);
    // A retry after a crash between storing files and committing keeps the same attachment ids.
    const before = await m.models.AttachmentModel.findOne({ emailId });
    await m.models.EmailModel.updateOne({ _id: emailId }, { $set: { contentStatus: "failed" } });
    await m.models.EmailContentModel.deleteOne({ emailId });
    await m.models.ThreadModel.deleteMany({ orgId: seed.orgId });
    await m.inbound.fetchInboundEmail({ emailId });
    const after = await m.models.AttachmentModel.find({ emailId });
    expect(after).toHaveLength(1);
    expect(after[0]!._id.equals(before!._id)).toBe(true);
    expect(processed.fetchInbound).not.toBeNull();
  });

  it("marks the email unavailable when Resend no longer has it", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const inbound = m.fake.createFakeReceivedEmail(seed.key, {
      from: "a@b.test",
      to: [seed.mailbox],
      subject: "Gone",
      text: "x",
    });
    const processed = await m.processing.processWebhookEvent(
      await storeEvent(m, seed, "email.received", inbound.event as never),
    );
    m.fake.expireFakeReceivedEmail(seed.key, inbound.resendId);
    const result = await m.inbound.fetchInboundEmail({ emailId: processed.emailId! });
    expect(result).toEqual({ status: "unavailable" });
    expect((await m.models.EmailModel.findById(processed.emailId))!.contentStatus).toBe(
      "unavailable",
    );
  });

  it("markInboundFailed shows metadata with a retry state", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const inbound = m.fake.createFakeReceivedEmail(seed.key, {
      from: "a@b.test",
      to: [seed.mailbox],
      subject: "Bad",
      text: "x",
    });
    const processed = await m.processing.processWebhookEvent(
      await storeEvent(m, seed, "email.received", inbound.event as never),
    );
    await m.inbound.markInboundFailed(processed.emailId!);
    expect((await m.models.EmailModel.findById(processed.emailId))!.contentStatus).toBe("failed");
    // Retry puts it back in the queue.
    const ctx = ctxFor(m, seed.orgId, "support");
    await m.emails.retryInboundFetch(ctx, processed.emailId!);
    expect((await m.models.EmailModel.findById(processed.emailId))!.contentStatus).toBe("pending");
    expect(m.jobs.sentJobs.some((j) => j.name === "email/inbound.fetch.requested")).toBe(true);
  });
});

describe("fetch-inbound (Free plan: files stay at Resend)", () => {
  it("keeps metadata and download URLs, no raw MIME, serves small files through the route", async () => {
    const seed = await seedOrg(m, { plan: "free" });
    const { emailId } = await receive(seed, {
      from: "jane@customer.test",
      to: [seed.mailbox],
      subject: "Free plan",
      text: "see attached",
      attachments: [{ filename: "notes.txt", contentType: "text/plain", content: "free notes" }],
    });
    const content = await m.models.EmailContentModel.findOne({ emailId });
    expect(content!.rawStorageKey).toBeNull();
    expect(content!.text).toContain("see attached");
    const attachment = await m.models.AttachmentModel.findOne({ emailId });
    expect(attachment).toMatchObject({
      storageMode: "resend",
      storageKey: null,
      filename: "notes.txt",
    });
    expect(attachment!.resendDownload!.url).toMatch(/^fake:\/\/att\//);
    expect(attachment!.resendDownload!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Download: <= 4 MB is streamed through our route.
    const { openAttachmentForUser } = await import("@/lib/services/attachments");
    const userId = new Types.ObjectId();
    await m.models.OrgSettingsModel.findOne({ orgId: seed.orgId }); // ensure settings exist
    await (
      await import("mongoose")
    ).default.connection
      .collection("member")
      .insertOne({ organizationId: seed.orgId, userId, role: "support" });
    const access = await openAttachmentForUser(userId.toHexString(), attachment!._id.toHexString());
    expect(access.ok).toBe(true);
    if (access.ok && access.target.kind === "stream") {
      expect(access.target.body.toString()).toBe("free notes");
      expect(access.target.filename).toBe("notes.txt");
    } else {
      throw new Error("expected a stream target");
    }

    // Once Resend no longer has the file the chip says so.
    m.fake.expireFakeReceivedEmail(
      seed.key,
      (await m.models.EmailModel.findById(emailId))!.resendId!,
    );
    await m.models.AttachmentModel.updateOne(
      { _id: attachment!._id },
      { $set: { "resendDownload.expiresAt": new Date(Date.now() + 30_000) } },
    );
    const gone = await openAttachmentForUser(userId.toHexString(), attachment!._id.toHexString());
    expect(gone.ok && gone.target.kind).toBe("unavailable");
    expect((await m.models.AttachmentModel.findById(attachment!._id))!.availability).toBe(
      "unavailable",
    );
  });
});
