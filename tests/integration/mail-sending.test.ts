import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { startTestDb } from "./helpers";
import {
  ctxFor,
  emailData,
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
  ({ stop } = await startTestDb("mail-sending"));
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

const base = (seed: Seed) => ({
  senderId: seed.sender._id.toHexString(),
  to: ["jane@customer.test"],
  subject: "Welcome",
  html: "<p>Hello <b>Jane</b></p>",
});

const jobNames = () => m.jobs.sentJobs.map((j) => j.name);

describe("sendEmail", () => {
  it("sends an immediate email inline: queued doc first, then Resend, tags and idempotency", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId, "developer");
    const result = await m.sending.sendEmail(ctx, { ...base(seed), cc: ["bob@customer.test"] });
    expect(result).toMatchObject({ status: "sent", mode: "inline", threadId: null });

    const email = await m.models.EmailModel.findById(result.emailId);
    expect(email).toMatchObject({
      direction: "outbound",
      origin: "app",
      status: "queued", // becomes `sent` with Resend's email.sent event
      subject: "Welcome",
    });
    expect(email!.resendId).toMatch(/^em_fake_/);
    expect(email!.authorId!.toHexString()).toBe(ctx.user.id);
    expect(email!.recipientAddresses.sort()).toEqual(["bob@customer.test", "jane@customer.test"]);
    expect(email!.projectId).toBeNull();

    const [sent] = m.fake.fakeSentEmails(seed.key);
    expect(sent!.idempotencyKey).toBe(result.emailId);
    expect(sent!.input).toMatchObject({
      from: `"Support" <${seed.mailbox}>`,
      to: ["jane@customer.test"],
      cc: ["bob@customer.test"],
      subject: "Welcome",
      html: "<p>Hello <b>Jane</b></p>",
    });
    expect(sent!.input.tags).toEqual(
      expect.arrayContaining([
        { name: "mw_org", value: seed.orgId.toHexString() },
        { name: "mw_email", value: result.emailId },
      ]),
    );
    expect(sent!.input.headers).toBeUndefined();

    // The source HTML is only kept until Resend accepts the email.
    const content = await m.models.EmailContentModel.findOne({ emailId: email!._id });
    expect(content!.sourceHtml).toBeUndefined();
    expect(content!.html).toContain("Hello");

    // Events from Resend link to the same document through the tag.
    await m.processing.processWebhookEvent(
      await storeEvent(
        m,
        seed,
        "email.delivered",
        emailData(email!.resendId!, {
          from: seed.mailbox,
          tags: { mw_email: result.emailId },
        }),
      ),
    );
    expect((await m.models.EmailModel.findById(email!._id))!.status).toBe("delivered");
  });

  it("forbids viewers and validates input", async () => {
    const seed = await seedOrg(m);
    await expect(
      m.sending.sendEmail(ctxFor(m, seed.orgId, "viewer"), base(seed)),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
    const ctx = ctxFor(m, seed.orgId, "support");
    await expect(m.sending.sendEmail(ctx, { ...base(seed), to: [] })).rejects.toMatchObject({
      code: "validation",
      fieldErrors: { to: expect.any(Array) },
    });
    await expect(
      m.sending.sendEmail(ctx, { ...base(seed), to: ["not-an-email"] }),
    ).rejects.toMatchObject({
      code: "validation",
    });
    await expect(m.sending.sendEmail(ctx, { ...base(seed), html: "  " })).rejects.toMatchObject({
      code: "validation",
    });
    await expect(
      m.sending.sendEmail(ctx, { ...base(seed), scheduledAt: new Date(Date.now() - 1000) }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(m.fake.fakeSentEmails(seed.key)).toHaveLength(0);
    expect(await m.models.EmailModel.countDocuments({ orgId: seed.orgId })).toBe(0);
  });

  it("rejects an inactive sender, an unverified domain and an inactive connection before calling Resend", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId, "owner");

    await m.models.SenderModel.updateOne(
      { _id: seed.sender._id },
      { $set: { status: "domain_unverified", statusReason: "domain_failed" } },
    );
    await expect(m.sending.sendEmail(ctx, base(seed))).rejects.toMatchObject({
      code: "sender_inactive",
    });

    // Stale sender status: the sender still says active, but the domain is no longer verified.
    await m.models.SenderModel.updateOne(
      { _id: seed.sender._id },
      { $set: { status: "active" }, $unset: { statusReason: 1 } },
    );
    await m.models.DomainModel.updateOne({ _id: seed.domain._id }, { $set: { status: "pending" } });
    await expect(m.sending.sendEmail(ctx, base(seed))).rejects.toMatchObject({
      code: "domain_unverified",
    });

    await m.models.DomainModel.updateOne(
      { _id: seed.domain._id },
      { $set: { status: "verified" } },
    );
    await m.models.ConnectionModel.updateOne(
      { _id: seed.connectionId },
      { $set: { status: "needs_attention" } },
    );
    await expect(m.sending.sendEmail(ctx, base(seed))).rejects.toMatchObject({
      code: "connection_inactive",
    });

    expect(m.fake.fakeSentEmails(seed.key)).toHaveLength(0);
    expect(await m.models.EmailModel.countDocuments({ orgId: seed.orgId })).toBe(0);

    // Disabled by a member.
    await m.models.ConnectionModel.updateOne(
      { _id: seed.connectionId },
      { $set: { status: "active" } },
    );
    await m.senders.setSenderDisabled(ctx, { id: seed.sender._id.toHexString(), disabled: true });
    await expect(m.sending.sendEmail(ctx, base(seed))).rejects.toMatchObject({
      code: "sender_inactive",
    });
  });

  it("sets In-Reply-To and References when replying, and threads our reply", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId, "support");
    const thread = await m.models.ThreadModel.create({
      orgId: seed.orgId,
      connectionId: seed.connectionId,
      domainId: seed.domain._id,
      mailboxAddress: seed.mailbox,
      subject: "Invoice question",
      subjectKey: "invoice question",
      participants: ["jane@customer.test"],
      messageCount: 1,
      lastMessageAt: new Date(Date.now() - 60_000),
      lastInboundAt: new Date(Date.now() - 60_000),
      snippet: "Where is it?",
    });
    const parent = await m.models.EmailModel.create({
      orgId: seed.orgId,
      connectionId: seed.connectionId,
      resendId: "rcv_parent",
      direction: "inbound",
      origin: "external",
      domainId: seed.domain._id,
      threadId: thread._id,
      messageId: "<parent@customer.test>",
      references: ["<root@customer.test>"],
      from: { address: "jane@customer.test" },
      to: [{ address: seed.mailbox }],
      subject: "Invoice question",
      status: "received",
      contentStatus: "ready",
    });

    const result = await m.sending.sendEmail(ctx, {
      ...base(seed),
      subject: "Re: Invoice question",
      inReplyToEmailId: parent._id.toHexString(),
    });
    expect(result.threadId).toBe(thread._id.toHexString());
    const [sent] = m.fake.fakeSentEmails(seed.key);
    expect(sent!.input.headers).toEqual({
      "In-Reply-To": "<parent@customer.test>",
      References: "<root@customer.test> <parent@customer.test>",
    });
    const ours = await m.models.EmailModel.findById(result.emailId);
    expect(ours).toMatchObject({
      inReplyTo: "<parent@customer.test>",
      references: ["<root@customer.test>", "<parent@customer.test>"],
    });
    expect(ours!.threadId!.equals(thread._id)).toBe(true);
    const after = await m.models.ThreadModel.findById(thread._id);
    expect(after).toMatchObject({ messageCount: 2 });
    expect(after!.lastOutboundAt).toBeInstanceOf(Date);

    // A reply to something the caller cannot see is refused.
    await expect(
      m.sending.sendEmail(ctxFor(m, new Types.ObjectId(), "owner"), {
        ...base(seed),
        inReplyToEmailId: parent._id.toHexString(),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps the email queued and hands it to the job when Resend rate-limits", async () => {
    const seed = await seedOrg(m);
    // Re-point the connection at a rate-limited fake key (same team, `ratelimit` flag).
    const key = `re_${seed.team}_ratelimit`;
    await m.models.ConnectionModel.updateOne(
      { _id: seed.connectionId },
      {
        $set: { apiKey: m.envelope.encryptSecret(key, { aad: m.hook.keyAad(seed.connectionId) }) },
      },
    );
    const result = await m.sending.sendEmail(ctxFor(m, seed.orgId), base(seed));
    expect(result).toMatchObject({ status: "queued", mode: "job" });
    expect(jobNames()).toContain("email/send.requested");
    expect((await m.models.EmailModel.findById(result.emailId))!.resendId).toBeNull();
  });

  it("marks the domain and senders unusable when Resend rejects the domain, and requests a domain sync", async () => {
    const seed = await seedOrg(m);
    // Our mirror says verified, Resend's account has never heard of this domain.
    const ghost = await m.models.DomainModel.create({
      orgId: seed.orgId,
      connectionId: seed.connectionId,
      resendId: "dom_ghost",
      name: "ghost.example.org",
      status: "verified",
    });
    const sender = await m.models.SenderModel.create({
      orgId: seed.orgId,
      domainId: ghost._id,
      localPart: "hi",
      address: "hi@ghost.example.org",
      status: "active",
    });
    const ctx = ctxFor(m, seed.orgId);
    await expect(
      m.sending.sendEmail(ctx, { ...base(seed), senderId: sender._id.toHexString() }),
    ).rejects.toMatchObject({
      code: "domain_unverified",
      message: expect.stringContaining("ghost.example.org"),
    });

    expect(await m.models.SenderModel.findById(sender._id)).toMatchObject({
      status: "domain_unverified",
      statusReason: "resend_rejected_domain",
    });
    expect((await m.models.DomainModel.findById(ghost._id))!.status).toBe("failed");
    const email = await m.models.EmailModel.findOne({ senderId: sender._id });
    expect(email).toMatchObject({ status: "failed", sendError: { code: "domain_rejected" } });
    expect(jobNames()).toContain("connection/sync.requested");
    // The other sender on the healthy domain is untouched.
    expect((await m.models.SenderModel.findById(seed.sender._id))!.status).toBe("active");
  });
});

describe("scheduled emails", () => {
  it("queues a job, sends with scheduled_at, cancels in Resend first, and reschedules", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId, "developer");
    const when = new Date(Date.now() + 2 * 3_600_000);
    const result = await m.sending.sendEmail(ctx, { ...base(seed), scheduledAt: when });
    expect(result).toMatchObject({ status: "scheduled", mode: "job" });
    expect(jobNames()).toContain("email/send.requested");
    let email = await m.models.EmailModel.findById(result.emailId);
    expect(email).toMatchObject({ status: "scheduled", resendId: null });
    expect(email!.scheduledAt).toEqual(when);
    expect(m.fake.fakeSentEmails(seed.key)).toHaveLength(0);

    // The job fires: Resend gets scheduled_at and holds the email.
    const delivered = await m.sending.deliverEmail(result.emailId);
    expect(delivered).toMatchObject({ status: "sent" });
    expect(await m.sending.deliverEmail(result.emailId)).toEqual({
      status: "skipped",
      reason: "already_sent",
    });
    expect(m.fake.fakeSentEmails(seed.key)).toHaveLength(1);
    expect(m.fake.fakeSentEmails(seed.key)[0]).toMatchObject({
      status: "scheduled",
      input: { scheduledAt: when.toISOString() },
    });

    // Reschedule.
    const later = new Date(Date.now() + 5 * 3_600_000);
    await m.sending.rescheduleEmail(ctx, { emailId: result.emailId, scheduledAt: later });
    expect(m.fake.fakeSentEmails(seed.key)[0]!.input.scheduledAt).toBe(later.toISOString());
    expect((await m.models.EmailModel.findById(result.emailId))!.scheduledAt).toEqual(later);
    await expect(
      m.sending.rescheduleEmail(ctx, {
        emailId: result.emailId,
        scheduledAt: new Date(Date.now() - 1000),
      }),
    ).rejects.toMatchObject({ code: "validation" });

    // Scheduled list shows it.
    const list = await m.emails.listThreads(ctx, { folder: "scheduled" });
    expect(list.items.map((i) => i.id)).toEqual([result.emailId]);

    // Cancel: Resend first, then locally.
    await m.sending.cancelScheduledEmail(ctx, result.emailId);
    expect(m.fake.fakeSentEmails(seed.key)[0]!.status).toBe("canceled");
    email = await m.models.EmailModel.findById(result.emailId);
    expect(email!.status).toBe("canceled");
    expect((await m.emails.listThreads(ctx, { folder: "scheduled" })).items).toHaveLength(0);
    // Canceling again: nothing left to cancel.
    await expect(m.sending.cancelScheduledEmail(ctx, result.emailId)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("cancels an email the job has not handed over yet, and the job then skips it", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId);
    const result = await m.sending.sendEmail(ctx, {
      ...base(seed),
      scheduledAt: new Date(Date.now() + 3_600_000),
    });
    await m.sending.cancelScheduledEmail(ctx, result.emailId);
    expect((await m.models.EmailModel.findById(result.emailId))!.status).toBe("canceled");
    expect(await m.sending.deliverEmail(result.emailId)).toEqual({
      status: "skipped",
      reason: "not_pending",
    });
    expect(m.fake.fakeSentEmails(seed.key)).toHaveLength(0);
  });

  it("refuses to cancel once the send time has passed or Resend already sent it", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId);
    const result = await m.sending.sendEmail(ctx, {
      ...base(seed),
      scheduledAt: new Date(Date.now() + 3_600_000),
    });
    await m.models.EmailModel.updateOne(
      { _id: result.emailId },
      { $set: { scheduledAt: new Date(Date.now() - 1000) } },
    );
    await expect(m.sending.cancelScheduledEmail(ctx, result.emailId)).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(
      m.sending.rescheduleEmail(ctx, {
        emailId: result.emailId,
        scheduledAt: new Date(Date.now() + 9e6),
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    // Resend says it is no longer cancelable (it went out): nothing is canceled here either.
    const second = await m.sending.sendEmail(ctx, {
      ...base(seed),
      scheduledAt: new Date(Date.now() + 3_600_000),
    });
    await m.sending.deliverEmail(second.emailId);
    const fakeEmail = m.fake.fakeSentEmails(seed.key).at(-1)!;
    fakeEmail.status = "sent";
    await expect(m.sending.cancelScheduledEmail(ctx, second.emailId)).rejects.toMatchObject({
      code: "conflict",
    });
    expect((await m.models.EmailModel.findById(second.emailId))!.status).toBe("scheduled");
  });

  it("re-checks sendability when a scheduled email fires and lists it under needs attention", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId);
    const result = await m.sending.sendEmail(ctx, {
      ...base(seed),
      scheduledAt: new Date(Date.now() + 3_600_000),
    });
    // The domain stops being verified before the job fires (domain.updated).
    await m.processing.processWebhookEvent(
      await storeEvent(m, seed, "domain.updated", {
        id: seed.domain.resendId,
        name: seed.domain.name,
        status: "failed",
        created_at: new Date().toISOString(),
        region: "us-east-1",
      }),
    );
    const attention = await m.sending.listNeedsAttention(ctx);
    expect(attention).toEqual([
      expect.objectContaining({
        emailId: result.emailId,
        senderAddress: seed.mailbox,
        reason: "domain_failed",
      }),
    ]);
    await expect(m.sending.deliverEmail(result.emailId)).rejects.toMatchObject({
      code: "sender_inactive",
    });
    expect(await m.models.EmailModel.findById(result.emailId)).toMatchObject({
      status: "failed",
      sendError: { code: "sender_inactive" },
    });
  });
});

describe("attachments and drafts", () => {
  it("uploads to a draft with a presigned PUT, confirms it, and sends it via the job with a presigned GET", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const ctx = ctxFor(m, seed.orgId, "support");
    let draft = await m.drafts.saveDraft(ctx, {
      senderId: seed.sender._id.toHexString(),
      to: ["jane@customer.test"],
      subject: "With file",
    });

    const upload = await m.drafts.createAttachmentUpload(ctx, {
      draftId: draft.id,
      filename: "logo.png",
      size: tinyPng.length,
      contentType: "image/png",
    });
    expect(upload.headers).toEqual({
      "content-type": "image/png",
      "content-length": String(tinyPng.length),
    });

    // Confirm before the bytes arrive: refused, and the record is dropped from the draft.
    await expect(
      m.drafts.confirmAttachmentUpload(ctx, {
        draftId: draft.id,
        attachmentId: upload.attachmentId,
      }),
    ).rejects.toMatchObject({ code: "upload_failed" });

    // The dev-storage route stands in for R2: wrong type or size is refused, the signed one works.
    const route = await import("@/app/api/dev-storage/[token]/route");
    // A fresh upload URL (the failed confirm removed the object and marked the record failed).
    const retry = await m.drafts.createAttachmentUpload(ctx, {
      draftId: draft.id,
      filename: "logo.png",
      size: tinyPng.length,
      contentType: "image/png",
    });
    const retryToken = retry.uploadUrl.split("/").pop()!;
    const putRetry = (body: Buffer, type: string) =>
      route.PUT(
        new Request(retry.uploadUrl, {
          method: "PUT",
          body: new Uint8Array(body),
          headers: { "content-type": type },
        }),
        {
          params: Promise.resolve({ token: retryToken }),
        },
      );
    expect((await putRetry(tinyPng, "text/html")).status).toBe(403);
    expect((await putRetry(Buffer.concat([tinyPng, Buffer.from("x")]), "image/png")).status).toBe(
      403,
    );
    expect((await putRetry(tinyPng, "image/png")).status).toBe(200);

    const confirmed = await m.drafts.confirmAttachmentUpload(ctx, {
      draftId: draft.id,
      attachmentId: retry.attachmentId,
    });
    expect(confirmed).toMatchObject({
      filename: "logo.png",
      size: tinyPng.length,
      downloadUrl: `/api/files/${retry.attachmentId}`,
    });
    draft = await m.drafts.getDraft(ctx, draft.id);
    expect(draft.attachments.map((a) => a.id)).toEqual([retry.attachmentId]);

    // Limits: one file over 40 MB, and total over 40 MB.
    await expect(
      m.drafts.createAttachmentUpload(ctx, {
        draftId: draft.id,
        filename: "big.bin",
        size: 41 * 1024 * 1024,
        contentType: "application/zip",
      }),
    ).rejects.toMatchObject({ code: "attachment_too_large" });
    await expect(
      m.drafts.createAttachmentUpload(ctx, {
        draftId: draft.id,
        filename: "a.bin",
        size: 39 * 1024 * 1024,
        contentType: "application/zip",
      }),
    ).resolves.toBeTruthy();
    await expect(
      m.drafts.createAttachmentUpload(ctx, {
        draftId: draft.id,
        filename: "b.bin",
        size: 2 * 1024 * 1024,
        contentType: "application/zip",
      }),
    ).rejects.toMatchObject({ code: "attachment_too_large" });

    // Send: attachments go through the job; the file moves under the email and Resend gets a URL.
    const sent = await m.sending.sendEmail(ctx, {
      senderId: seed.sender._id.toHexString(),
      to: ["jane@customer.test"],
      subject: "With file",
      html: "<p>see attached</p>",
      draftId: draft.id,
    });
    expect(sent).toMatchObject({ status: "queued", mode: "job" });
    expect(await m.models.DraftModel.countDocuments({ _id: draft.id })).toBe(0);
    expect(await m.sending.deliverEmail(sent.emailId)).toMatchObject({ status: "sent" });

    const [out] = m.fake.fakeSentEmails(seed.key);
    expect(out!.input.attachments).toHaveLength(1);
    expect(out!.input.attachments![0]).toMatchObject({
      filename: "logo.png",
      contentType: "image/png",
    });
    expect(out!.input.attachments![0]!.path).toMatch(/\/api\/dev-storage\//);
    const att = await m.models.AttachmentModel.findById(retry.attachmentId);
    expect(att).toMatchObject({
      emailId: new Types.ObjectId(sent.emailId),
      draftId: null,
      storageMode: "r2",
    });
    expect(att!.storageKey).toBe(`orgs/${seed.orgId}/outbound/${sent.emailId}/att/${att!._id}`);
    expect(await m.storage.getStore().head(att!.storageKey!)).toMatchObject({
      size: tinyPng.length,
    });
    expect(
      await m.storage.getStore().head(`drafts/${seed.orgId}/${draft.id}/${retry.attachmentId}`),
    ).toBeNull();

    // The presigned GET Resend fetches serves the file with a download disposition.
    const getRoute = await route.GET(new Request(out!.input.attachments![0]!.path), {
      params: Promise.resolve({ token: out!.input.attachments![0]!.path.split("/").pop()! }),
    });
    expect(getRoute.status).toBe(200);
    expect(getRoute.headers.get("content-disposition")).toContain(
      'attachment; filename="logo.png"',
    );
    expect(Buffer.from(await getRoute.arrayBuffer()).equals(tinyPng)).toBe(true);
  });

  it("deletes outbound files after Resend accepts them on the Free plan", async () => {
    const seed = await seedOrg(m, { plan: "free" });
    const ctx = ctxFor(m, seed.orgId);
    const draft = await m.drafts.saveDraft(ctx, { senderId: seed.sender._id.toHexString() });
    const up = await m.drafts.createAttachmentUpload(ctx, {
      draftId: draft.id,
      filename: "n.txt",
      size: 3,
      contentType: "text/plain",
    });
    const draftKey = `drafts/${seed.orgId}/${draft.id}/${up.attachmentId}`;
    await m.storage.getStore().put(draftKey, Buffer.from("abc"), { contentType: "text/plain" });
    await m.drafts.confirmAttachmentUpload(ctx, {
      draftId: draft.id,
      attachmentId: up.attachmentId,
    });
    const sent = await m.sending.sendEmail(ctx, { ...base(seed), draftId: draft.id });
    await m.sending.deliverEmail(sent.emailId);
    const att = await m.models.AttachmentModel.findById(up.attachmentId);
    expect(att).toMatchObject({ storageMode: "none", storageKey: null });
    expect(
      await m.storage
        .getStore()
        .head(`orgs/${seed.orgId}/outbound/${sent.emailId}/att/${up.attachmentId}`),
    ).toBeNull();
  });

  it("autosaves with optimistic concurrency", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId, "support");
    const first = await m.drafts.saveDraft(ctx, { subject: "v1", to: ["a@b.test"] });
    expect(first.version).toBe(0);
    const second = await m.drafts.saveDraft(ctx, {
      id: first.id,
      version: first.version,
      subject: "v2",
    });
    expect(second).toMatchObject({ subject: "v2", to: ["a@b.test"], version: 1 });
    // A stale tab saves with the old version: conflict, nothing written.
    await expect(
      m.drafts.saveDraft(ctx, { id: first.id, version: first.version, subject: "stale" }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await m.drafts.getDraft(ctx, first.id)).subject).toBe("v2");
    // Drafts are private to their author.
    const other = ctxFor(m, seed.orgId, "support");
    await expect(m.drafts.getDraft(other, first.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await m.drafts.listDrafts(other)).toHaveLength(0);
    expect(await m.drafts.listDrafts(ctx)).toHaveLength(1);
    // Viewers cannot draft.
    await expect(
      m.drafts.saveDraft(ctxFor(m, seed.orgId, "viewer"), { subject: "x" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await m.drafts.deleteDraft(ctx, first.id);
    expect(await m.drafts.listDrafts(ctx)).toHaveLength(0);
  });
});

describe("senders", () => {
  it("derives status from domain and connection and recovers automatically", async () => {
    const { deriveSenderStatus } = m.senders;
    const ok = { status: "verified" as const };
    const active = { status: "active" as const };
    expect(deriveSenderStatus({ current: "active", domain: ok, connection: active })).toEqual({
      status: "active",
      reason: null,
    });
    expect(
      deriveSenderStatus({ current: "active", domain: { status: "failed" }, connection: active }),
    ).toEqual({ status: "domain_unverified", reason: "domain_failed" });
    expect(
      deriveSenderStatus({ current: "active", domain: { status: "pending" }, connection: active }),
    ).toEqual({ status: "domain_unverified", reason: "domain_pending" });
    expect(deriveSenderStatus({ current: "active", domain: null, connection: active })).toEqual({
      status: "domain_unverified",
      reason: "domain_deleted_in_resend",
    });
    expect(
      deriveSenderStatus({
        current: "active",
        domain: ok,
        connection: { status: "needs_attention", statusReason: "key_revoked" },
      }),
    ).toEqual({ status: "connection_inactive", reason: "key_revoked" });
    expect(
      deriveSenderStatus({ current: "active", domain: ok, connection: { status: "read_only" } }),
    ).toEqual({ status: "connection_inactive", reason: "connection_read_only" });
    // Connection trouble wins over a domain problem; `disabled` is never overridden.
    expect(
      deriveSenderStatus({
        current: "active",
        domain: { status: "failed" },
        connection: { status: "read_only" },
      }).status,
    ).toBe("connection_inactive");
    expect(deriveSenderStatus({ current: "disabled", domain: ok, connection: active }).status).toBe(
      "disabled",
    );
    // Recovery: unusable -> active once the cause clears.
    expect(
      deriveSenderStatus({ current: "domain_unverified", domain: ok, connection: active }),
    ).toEqual({ status: "active", reason: null });
  });

  it("recomputes on connection status changes and keeps member-disabled senders disabled", async () => {
    const seed = await seedOrg(m);
    const disabled = await m.models.SenderModel.create({
      orgId: seed.orgId,
      domainId: seed.domain._id,
      localPart: "off",
      address: `off@${seed.domain.name}`,
      status: "disabled",
    });
    await m.models.ConnectionModel.updateOne(
      { _id: seed.connectionId },
      { $set: { status: "needs_attention", statusReason: "key_revoked" } },
    );
    const down = await m.senders.recomputeSenderStatuses(seed.orgId, {
      connectionId: seed.connectionId,
    });
    expect(down.changed).toHaveLength(1);
    expect(await m.models.SenderModel.findById(seed.sender._id)).toMatchObject({
      status: "connection_inactive",
      statusReason: "key_revoked",
    });
    expect((await m.models.SenderModel.findById(disabled._id))!.status).toBe("disabled");

    await m.models.ConnectionModel.updateOne(
      { _id: seed.connectionId },
      { $set: { status: "active" }, $unset: { statusReason: 1 } },
    );
    await m.senders.recomputeSenderStatuses(seed.orgId, { connectionId: seed.connectionId });
    const back = await m.models.SenderModel.findById(seed.sender._id);
    expect(back!.status).toBe("active");
    expect(back!.statusReason).toBeUndefined();
    expect((await m.models.SenderModel.findById(disabled._id))!.status).toBe("disabled");
  });

  it("only lets verified domains create senders, with roles and optimistic updates", async () => {
    const seed = await seedOrg(m);
    const owner = ctxFor(m, seed.orgId, "owner");
    const created = await m.senders.createSender(owner, {
      domainId: seed.domain._id.toHexString(),
      localPart: "Billing",
      displayName: "Billing",
      replyTo: ["help@elsewhere.test"],
    });
    expect(created).toMatchObject({
      address: `billing@${seed.domain.name}`,
      status: "active",
      isDefault: false,
      canReceiveReplies: false,
    });
    expect(created.receivingNote).toContain("elsewhere.test");
    await expect(
      m.senders.createSender(owner, {
        domainId: seed.domain._id.toHexString(),
        localPart: "billing",
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    await m.models.DomainModel.updateOne({ _id: seed.domain._id }, { $set: { status: "pending" } });
    await expect(
      m.senders.createSender(owner, {
        domainId: seed.domain._id.toHexString(),
        localPart: "sales",
      }),
    ).rejects.toMatchObject({ code: "domain_unverified" });
    await expect(
      m.senders.createSender(ctxFor(m, seed.orgId, "support"), {
        domainId: seed.domain._id.toHexString(),
        localPart: "x",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect((await m.senders.listSenders(ctxFor(m, seed.orgId, "support"))).length).toBe(2);

    const updated = await m.senders.updateSender(owner, {
      id: created.id,
      version: created.version,
      displayName: "Billing Team",
    });
    expect(updated.displayName).toBe("Billing Team");
    await expect(
      m.senders.updateSender(owner, {
        id: created.id,
        version: created.version,
        displayName: "stale",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
