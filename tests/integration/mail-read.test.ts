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
  ({ stop } = await startTestDb("mail-read"));
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

async function receive(
  seed: Seed,
  subject: string,
  extra: Partial<Parameters<Mail["fake"]["createFakeReceivedEmail"]>[1]> = {},
  from = "jane@customer.test",
) {
  const inbound = m.fake.createFakeReceivedEmail(seed.key, {
    from,
    to: [seed.mailbox],
    subject,
    text: `body of ${subject}`,
    ...extra,
  });
  const processed = await m.processing.processWebhookEvent(
    await storeEvent(m, seed, "email.received", inbound.event as never),
  );
  await m.inbound.fetchInboundEmail({ emailId: processed.emailId! });
  const email = await m.models.EmailModel.findById(processed.emailId);
  return { emailId: processed.emailId!, threadId: email!.threadId!.toHexString(), inbound };
}

describe("listThreads and getThread", () => {
  it("lists the inbox newest first with per-member unread and keyset pagination", async () => {
    const seed = await seedOrg(m);
    const a = await receive(seed, "First", {}, "a@customer.test");
    const b = await receive(seed, "Second", {}, "b@customer.test");
    const c = await receive(seed, "Third", {}, "c@customer.test");
    const ctx = ctxFor(m, seed.orgId, "support");

    const page1 = await m.emails.listThreads(ctx, { folder: "inbox", limit: 2 });
    expect(page1.items.map((i) => i.subject)).toEqual(["Third", "Second"]);
    expect(page1.items.every((i) => i.unread && i.kind === "thread")).toBe(true);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await m.emails.listThreads(ctx, {
      folder: "inbox",
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items.map((i) => i.subject)).toEqual(["First"]);
    expect(page2.nextCursor).toBeNull();

    // Read state is per member.
    await m.threads.markThreadRead(ctx, b.threadId);
    const other = ctxFor(m, seed.orgId, "support");
    expect(
      (await m.emails.listThreads(ctx, { folder: "inbox", unread: true })).items.map(
        (i) => i.subject,
      ),
    ).toEqual(["Third", "First"]);
    expect(
      (await m.emails.listThreads(other, { folder: "inbox", unread: true })).items,
    ).toHaveLength(3);
    expect((await m.emails.getThread(ctx, b.threadId)).unread).toBe(false);
    expect((await m.emails.getThread(other, b.threadId)).unread).toBe(true);
    await m.threads.markThreadUnread(ctx, b.threadId);
    expect((await m.emails.getThread(ctx, b.threadId)).unread).toBe(true);

    // A new inbound message makes a read thread unread again.
    await m.threads.markThreadRead(ctx, a.threadId);
    await receive(seed, "Re: First", {}, "a@customer.test");
    expect(
      (await m.emails.listThreads(ctx, { folder: "inbox", unread: true })).items.map((i) => i.id),
    ).toContain(a.threadId);
    void c;
  });

  it("searches by subject, snippet and sender within the org only", async () => {
    const seed = await seedOrg(m);
    const other = await seedOrg(m);
    await receive(seed, "Refund for order 1042");
    await receive(seed, "Shipping delay");
    await receive(other, "Refund for someone else");
    const ctx = ctxFor(m, seed.orgId, "owner");
    const hits = await m.emails.listThreads(ctx, { folder: "inbox", q: "refund" });
    expect(hits.items.map((i) => i.subject)).toEqual(["Refund for order 1042"]);
    expect(
      (await m.emails.listThreads(ctx, { folder: "inbox", q: "customer.test" })).items,
    ).toHaveLength(2);
  });

  it("respects projectFilter: scoped members only see their projects, in lists and by id", async () => {
    const p1 = new Types.ObjectId();
    const p2 = new Types.ObjectId();
    const seed1 = await seedOrg(m, { projectId: p1 });
    // A second domain in the same org, tagged with another project.
    const domain2 = await m.models.DomainModel.create({
      orgId: seed1.orgId,
      connectionId: seed1.connectionId,
      resendId: "dom_second",
      name: "second.example.net",
      status: "verified",
      projectId: p2,
      receiving: { enabled: true },
    });
    const one = await receive(seed1, "Project one mail");
    const inbound2 = m.fake.createFakeReceivedEmail(seed1.key, {
      from: "x@customer.test",
      to: ["help@second.example.net"],
      subject: "Project two mail",
      text: "hi",
    });
    const processed2 = await m.processing.processWebhookEvent(
      await storeEvent(m, seed1, "email.received", inbound2.event as never),
    );
    await m.inbound.fetchInboundEmail({ emailId: processed2.emailId! });
    const two = (await m.models.EmailModel.findById(processed2.emailId))!.threadId!.toHexString();
    expect((await m.models.ThreadModel.findById(two))!.projectId!.equals(p2)).toBe(true);
    void domain2;

    const admin = ctxFor(m, seed1.orgId, "admin");
    expect((await m.emails.listThreads(admin, { folder: "inbox" })).items).toHaveLength(2);

    const scoped = ctxFor(m, seed1.orgId, "support", { projectScope: [p1.toHexString()] });
    const list = await m.emails.listThreads(scoped, { folder: "inbox" });
    expect(list.items.map((i) => i.subject)).toEqual(["Project one mail"]);
    // Narrowing by a project outside the scope never widens it.
    expect(
      (await m.emails.listThreads(scoped, { folder: "inbox", projectId: p2.toHexString() })).items,
    ).toHaveLength(0);
    expect(
      (await m.emails.listThreads(scoped, { folder: "inbox", projectId: p1.toHexString() })).items,
    ).toHaveLength(1);
    // Search cannot leak either.
    expect(
      (await m.emails.listThreads(scoped, { folder: "inbox", q: "Project" })).items.map(
        (i) => i.subject,
      ),
    ).toEqual(["Project one mail"]);
    // Detail, read state, trash and activity all apply the same filter.
    await expect(m.emails.getThread(scoped, two)).rejects.toMatchObject({ code: "not_found" });
    await expect(m.threads.markThreadRead(scoped, two)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await m.threads.trashItems(scoped, { threadIds: [two] })).toEqual({
      threads: 0,
      emails: 0,
    });
    expect((await m.emails.getThread(scoped, one.threadId)).id).toBe(one.threadId);
    const activity = await m.emails.listActivity(scoped, {});
    expect(activity.items.every((r) => r.projectId === p1.toHexString())).toBe(true);
    expect(activity.items).toHaveLength(1);
  });

  it("isolates orgs", async () => {
    const a = await seedOrg(m);
    const b = await seedOrg(m);
    const mine = await receive(a, "Mine");
    await receive(b, "Theirs");
    const ctxB = ctxFor(m, b.orgId, "owner");
    expect(
      (await m.emails.listThreads(ctxB, { folder: "inbox" })).items.map((i) => i.subject),
    ).toEqual(["Theirs"]);
    await expect(m.emails.getThread(ctxB, mine.threadId)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(m.emails.getEmailTimeline(ctxB, mine.emailId)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("renders a message with signed embedded images, attachment lists and safe HTML", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const { threadId } = await receive(seed, "Look", {
      html: `<p>Hi</p><img src="cid:logo1"><img src="cid:gone"><script>x()</script>`,
      attachments: [
        { filename: "logo.png", contentType: "image/png", content: tinyPng, contentId: "logo1" },
        { filename: "photo.png", contentType: "image/png", content: tinyPng },
        { filename: "doc.pdf", contentType: "application/pdf", content: "%PDF" },
      ],
    });
    const ctx = ctxFor(m, seed.orgId, "viewer");
    const thread = await m.emails.getThread(ctx, threadId);
    const [msg] = thread.messages;
    expect(msg!.contentStatus).toBe("ready");
    expect(msg!.html).not.toContain("cid:");
    expect(msg!.html).not.toMatch(/<script/i);
    expect(msg!.html).toMatch(/src="http:\/\/localhost:3000\/api\/dev-storage\/[^"]+"/);
    expect(msg!.html).toContain("data:image/svg+xml"); // the missing image placeholder
    const by = Object.fromEntries(msg!.attachments.map((a) => [a.filename, a]));
    expect(by["logo.png"]!.embedded).toBe(true);
    expect(by["logo.png"]!.thumbnailUrl).toBeNull();
    expect(by["photo.png"]!.thumbnailUrl).toMatch(/\/api\/dev-storage\//);
    expect(by["doc.pdf"]!.thumbnailUrl).toBeNull();
    expect(by["doc.pdf"]!.downloadUrl).toMatch(/^\/api\/files\/[0-9a-f]{24}$/);
    expect(msg!.receipts).toBeNull();
  });

  it("shows read receipts from the event timeline on our replies", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId, "support");
    const first = await receive(seed, "Question");
    const reply = await m.sending.sendEmail(ctx, {
      senderId: seed.sender._id.toHexString(),
      to: ["jane@customer.test"],
      subject: "Re: Question",
      text: "Answer",
      inReplyToEmailId: first.emailId,
    });
    const resendId = (await m.models.EmailModel.findById(reply.emailId))!.resendId!;
    const tag = { mw_email: reply.emailId };
    const t0 = Date.now();
    for (const [type, offset] of [
      ["email.sent", 0],
      ["email.delivered", 2_000],
      ["email.opened", 120_000],
      ["email.opened", 180_000],
    ] as const) {
      await m.processing.processWebhookEvent(
        await storeEvent(
          m,
          seed,
          type,
          emailData(resendId, { from: seed.mailbox, tags: tag }),
          new Date(t0 + offset),
        ),
      );
    }
    const thread = await m.emails.getThread(ctx, first.threadId);
    expect(thread.messages.map((x) => x.direction)).toEqual(["inbound", "outbound"]);
    const receipts = thread.messages[1]!.receipts!;
    expect(receipts).toMatchObject({
      status: "opened",
      openCount: 2,
      opensTracked: true,
      likelyAutomatedOpen: false,
    });
    expect(receipts.events.map((e) => e.type)).toEqual([
      "email.sent",
      "email.delivered",
      "email.opened",
      "email.opened",
    ]);
    expect(receipts.firstOpenedAt).toBe(new Date(t0 + 120_000).toISOString());

    // Open tracking off on the domain: "Opens not tracked".
    await m.models.DomainModel.updateOne(
      { _id: seed.domain._id },
      { $set: { openTracking: false } },
    );
    expect(
      (await m.emails.getThread(ctx, first.threadId)).messages[1]!.receipts!.opensTracked,
    ).toBe(false);

    // Sent list and activity both show the reply; the timeline carries raw payloads.
    expect((await m.emails.listThreads(ctx, { folder: "sent" })).items.map((i) => i.id)).toEqual([
      reply.emailId,
    ]);
    const timeline = await m.emails.getEmailTimeline(ctx, reply.emailId);
    expect(timeline.entries.map((e) => e.type)).toEqual([
      "email.sent",
      "email.delivered",
      "email.opened",
      "email.opened",
    ]);
    expect(timeline.entries[0]!.payload).toMatchObject({ email_id: resendId });
  });
});

describe("activity", () => {
  it("filters by direction, status, tag, recipient and date, and paginates", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId, "owner");
    const from = `App <app@${seed.domain.name}>`;
    for (let i = 0; i < 5; i++) {
      await m.processing.processWebhookEvent(
        await storeEvent(
          m,
          seed,
          "email.sent",
          emailData(`em_act_${i}`, {
            from,
            to: [`user${i}@customer.test`],
            tags: { campaign: i % 2 ? "spring" : "winter" },
          }),
        ),
      );
    }
    await m.processing.processWebhookEvent(
      await storeEvent(
        m,
        seed,
        "email.bounced",
        emailData("em_act_0", { from, bounce: { type: "Permanent" } }),
      ),
    );
    await receive(seed, "Inbound one");

    const all = await m.emails.listActivity(ctx, { limit: 4 });
    expect(all.items).toHaveLength(4);
    expect(all.nextCursor).toBeTruthy();
    const rest = await m.emails.listActivity(ctx, { limit: 4, cursor: all.nextCursor });
    expect(rest.items).toHaveLength(2);
    expect(new Set([...all.items, ...rest.items].map((i) => i.id)).size).toBe(6);

    expect(
      (await m.emails.listActivity(ctx, { filters: { direction: "inbound" } })).items,
    ).toHaveLength(1);
    expect(
      (await m.emails.listActivity(ctx, { filters: { statuses: ["bounced"] } })).items.map(
        (i) => i.subject,
      ),
    ).toEqual(["Hello"]);
    expect(
      (
        await m.emails.listActivity(ctx, {
          filters: { tag: { name: "campaign", value: "spring" } },
        })
      ).items,
    ).toHaveLength(2);
    expect(
      (await m.emails.listActivity(ctx, { filters: { recipient: "USER3@customer.test" } })).items,
    ).toHaveLength(1);
    expect(
      (await m.emails.listActivity(ctx, { filters: { from: new Date(Date.now() + 60_000) } }))
        .items,
    ).toHaveLength(0);
    // Viewers may read activity; a member without the permission may not.
    await expect(m.emails.listActivity(ctxFor(m, seed.orgId, "viewer"), {})).resolves.toBeTruthy();
  });
});

describe("trash", () => {
  it("trashes and restores threads and single messages, recomputing counters", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId, "support");
    const first = await receive(seed, "Conversation", {}, "jane@customer.test");
    const second = await receive(seed, "Re: Conversation", {}, "jane@customer.test");
    expect(second.threadId).toBe(first.threadId);
    const other = await receive(seed, "Standalone", {}, "solo@customer.test");

    // One message of a thread goes to Trash: the thread stays, minus that message.
    expect(await m.threads.trashItems(ctx, { emailIds: [second.emailId] })).toEqual({
      threads: 0,
      emails: 1,
    });
    const inbox = await m.emails.listThreads(ctx, { folder: "inbox" });
    expect(inbox.items.find((i) => i.id === first.threadId)).toMatchObject({
      messageCount: 1,
      snippet: "body of Conversation",
    });
    expect((await m.emails.getThread(ctx, first.threadId)).messages).toHaveLength(1);
    let trash = await m.emails.listThreads(ctx, { folder: "trash" });
    expect(trash.items).toEqual([
      expect.objectContaining({ kind: "email", id: second.emailId, purgeAt: expect.any(String) }),
    ]);
    const purge =
      new Date(trash.items[0]!.purgeAt!).getTime() - new Date(trash.items[0]!.trashedAt!).getTime();
    expect(Math.round(purge / 86_400_000)).toBe(30);

    // A whole thread.
    expect(await m.threads.trashItems(ctx, { threadIds: [other.threadId] })).toEqual({
      threads: 1,
      emails: 0,
    });
    expect(
      (await m.emails.listThreads(ctx, { folder: "inbox" })).items.map((i) => i.id),
    ).not.toContain(other.threadId);
    trash = await m.emails.listThreads(ctx, { folder: "trash" });
    expect(trash.items.map((i) => `${i.kind}:${i.id}`).sort()).toEqual(
      [`email:${second.emailId}`, `thread:${other.threadId}`].sort(),
    );
    // Emails of a trashed thread do not appear on their own.
    expect(trash.items.filter((i) => i.kind === "email")).toHaveLength(1);

    // Restore both.
    await m.threads.restoreItems(ctx, { threadIds: [other.threadId], emailIds: [second.emailId] });
    expect((await m.emails.listThreads(ctx, { folder: "trash" })).items).toHaveLength(0);
    const back = await m.emails.listThreads(ctx, { folder: "inbox" });
    expect(back.items.find((i) => i.id === first.threadId)!.messageCount).toBe(2);
    expect(back.items.map((i) => i.id)).toContain(other.threadId);

    // A new message revives a trashed thread.
    await m.threads.trashItems(ctx, { threadIds: [other.threadId] });
    await receive(
      seed,
      "Re: Standalone",
      { inReplyTo: other.inbound.messageId },
      "solo@customer.test",
    );
    expect((await m.emails.listThreads(ctx, { folder: "inbox" })).items.map((i) => i.id)).toContain(
      other.threadId,
    );

    // Viewers cannot trash.
    await expect(
      m.threads.trashItems(ctxFor(m, seed.orgId, "viewer"), { threadIds: [first.threadId] }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
