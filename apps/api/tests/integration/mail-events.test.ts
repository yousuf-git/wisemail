import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { startTestDb } from "./helpers";
import { emailData, loadMail, seedOrg, storeEvent, type Mail } from "./mail-helpers";

let stop: () => Promise<void>;
let m: Mail;

beforeAll(async () => {
  ({ stop } = await startTestDb("mail-events"));
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

const at = (offsetSeconds: number) => new Date(Date.UTC(2026, 8, 29, 10, 0, offsetSeconds));

async function rollup(
  seed: Awaited<ReturnType<typeof seedOrg>>,
  granularity: "day" | "hour" = "day",
  kind = "all",
) {
  return m.models.MetricRollupModel.collection.findOne({
    orgId: seed.orgId,
    granularity,
    "dimension.kind": kind,
    domainId: seed.domain._id,
  });
}

describe("process-event", () => {
  it("creates a stub email for events from other apps, then moves it through its lifecycle", async () => {
    const seed = await seedOrg(m);
    const from = `Acme <hello@${seed.domain.name}>`;
    for (const [type, s] of [
      ["email.sent", 0],
      ["email.delivered", 3],
      ["email.opened", 60],
    ] as const) {
      const id = await storeEvent(m, seed, type, emailData("em_life", { from }), at(s));
      const out = await m.processing.processWebhookEvent(id);
      expect(out).toMatchObject({ found: true, type });
    }
    const email = await m.models.EmailModel.findOne({
      connectionId: seed.connectionId,
      resendId: "em_life",
    });
    expect(email).toMatchObject({
      direction: "outbound",
      origin: "external",
      status: "opened",
      openCount: 1,
      subject: "Hello",
    });
    expect(email!.domainId!.equals(seed.domain._id)).toBe(true);
    expect(email!.sentAt).toEqual(at(0));
    expect(email!.deliveredAt).toEqual(at(3));
    expect(email!.to[0]!.address).toBe("jane@customer.test");

    // Every event is linked to the email, so the timeline reads from webhook_events in order.
    const events = await m.models.WebhookEventModel.find({ emailId: email!._id }).sort({
      occurredAt: 1,
    });
    expect(events.map((e) => e.type)).toEqual(["email.sent", "email.delivered", "email.opened"]);
    expect(events.every((e) => e.processedAt instanceof Date)).toBe(true);

    // Rollups: daily and hourly buckets, domain totals and the transactional stream.
    const day = await rollup(seed);
    expect(day!.counts).toMatchObject({ sent: 1, delivered: 1, opened_total: 1, opened_unique: 1 });
    expect(day!.deliveryLatencyMs).toMatchObject({ count: 1, sum: 3000 });
    expect(await rollup(seed, "hour")).not.toBeNull();
    expect((await rollup(seed, "day", "stream"))!.counts.sent).toBe(1);
    expect(day!.bucketStart).toEqual(new Date(Date.UTC(2026, 8, 29)));

    // Realtime events were written for the change.
    const realtime = await m.models.RealtimeEventModel.countDocuments({
      orgId: seed.orgId,
      topics: `email:${email!._id.toHexString()}`,
    });
    expect(realtime).toBe(3);
  });

  it("keeps the highest status when events arrive out of order", async () => {
    const seed = await seedOrg(m);
    const from = `Acme <hello@${seed.domain.name}>`;
    const order: [string, number][] = [
      ["email.clicked", 120],
      ["email.opened", 60],
      ["email.delivered", 3],
      ["email.sent", 0],
    ];
    for (const [type, s] of order) {
      await m.processing.processWebhookEvent(
        await storeEvent(m, seed, type, emailData("em_ooo", { from }), at(s)),
      );
    }
    const email = await m.models.EmailModel.findOne({
      connectionId: seed.connectionId,
      resendId: "em_ooo",
    });
    expect(email).toMatchObject({ status: "clicked", openCount: 1, clickCount: 1 });
    expect(email!.sentAt).toEqual(at(0));
    expect(email!.deliveredAt).toEqual(at(3));
    const day = await rollup(seed);
    expect(day!.counts).toMatchObject({
      sent: 1,
      delivered: 1,
      opened_unique: 1,
      clicked_unique: 1,
    });
    // Delivery latency completes when the second of sent/delivered arrives, whichever it is.
    expect(day!.deliveryLatencyMs).toMatchObject({ count: 1, sum: 3000 });
  });

  it("is idempotent: reprocessing and concurrent processing change nothing twice", async () => {
    const seed = await seedOrg(m);
    const from = `Acme <hello@${seed.domain.name}>`;
    const id = await storeEvent(m, seed, "email.opened", emailData("em_idem", { from }), at(10));
    const results = await Promise.all([
      m.processing.processWebhookEvent(id),
      m.processing.processWebhookEvent(id),
      m.processing.processWebhookEvent(id),
    ]);
    expect(results.filter((r) => !r.alreadyProcessed)).toHaveLength(1);
    expect(await m.processing.processWebhookEvent(id)).toMatchObject({ alreadyProcessed: true });

    const email = await m.models.EmailModel.findOne({
      connectionId: seed.connectionId,
      resendId: "em_idem",
    });
    expect(email!.openCount).toBe(1);
    expect((await rollup(seed))!.counts.opened_total).toBe(1);
    expect(
      await m.models.EmailModel.countDocuments({
        connectionId: seed.connectionId,
        resendId: "em_idem",
      }),
    ).toBe(1);
  });

  it("reports unknown events as not found", async () => {
    await m.connect.connectDb();
    expect(await m.processing.processWebhookEvent(new Types.ObjectId().toHexString())).toEqual({
      found: false,
    });
    expect(await m.processing.processWebhookEvent("nope")).toEqual({ found: false });
  });

  it("counts events for a permanently deleted email in insights but never recreates it", async () => {
    const seed = await seedOrg(m);
    const from = `Acme <hello@${seed.domain.name}>`;
    await m.models.DeletionTombstoneModel.create({
      orgId: seed.orgId,
      connectionId: seed.connectionId,
      kind: "sent_email",
      resendId: "em_dead",
      messageIdHash: "h",
      deletedAt: new Date(),
      reason: "user",
      expireAt: new Date(Date.now() + 86_400_000),
    });
    const id = await storeEvent(m, seed, "email.opened", emailData("em_dead", { from }), at(5));
    const out = await m.processing.processWebhookEvent(id);
    expect(out).toMatchObject({ found: true, ignoredReason: "deleted" });
    expect(out.fetchInbound ?? null).toBeNull();

    expect(
      await m.models.EmailModel.countDocuments({
        connectionId: seed.connectionId,
        resendId: "em_dead",
      }),
    ).toBe(0);
    const stored = await m.models.WebhookEventModel.findById(id);
    expect(stored).toMatchObject({ ignoredReason: "deleted" });
    expect(stored!.processedAt).toBeInstanceOf(Date);
    expect(stored!.emailId).toBeNull();
    // Insights stay accurate.
    expect((await rollup(seed))!.counts).toMatchObject({ opened_total: 1 });
    // No realtime event: nothing user-visible changed.
    expect(await m.models.RealtimeEventModel.countDocuments({ orgId: seed.orgId })).toBe(0);
  });

  it("adopts an app-sent email by its mw_email tag before Resend's id was stored", async () => {
    const seed = await seedOrg(m);
    const email = await m.models.EmailModel.create({
      orgId: seed.orgId,
      connectionId: seed.connectionId,
      direction: "outbound",
      origin: "app",
      domainId: seed.domain._id,
      from: { address: seed.mailbox },
      to: [{ address: "jane@customer.test" }],
      subject: "Hello",
      status: "queued",
    });
    const id = await storeEvent(
      m,
      seed,
      "email.sent",
      emailData("em_adopt", { from: seed.mailbox, tags: { mw_email: email._id.toHexString() } }),
      at(1),
    );
    await m.processing.processWebhookEvent(id);
    const after = await m.models.EmailModel.findById(email._id);
    expect(after).toMatchObject({ resendId: "em_adopt", status: "sent", origin: "app" });
    expect(await m.models.EmailModel.countDocuments({ connectionId: seed.connectionId })).toBe(1);
  });

  it("records bounces and complaints and ranks them above opens", async () => {
    const seed = await seedOrg(m);
    const from = `Acme <hello@${seed.domain.name}>`;
    await m.processing.processWebhookEvent(
      await storeEvent(
        m,
        seed,
        "email.bounced",
        emailData("em_b", {
          from,
          bounce: { type: "Permanent", subType: "General", message: "gone" },
        }),
        at(5),
      ),
    );
    await m.processing.processWebhookEvent(
      await storeEvent(m, seed, "email.opened", emailData("em_b", { from }), at(9)),
    );
    const email = await m.models.EmailModel.findOne({ resendId: "em_b" });
    expect(email).toMatchObject({ status: "bounced", bounce: { type: "hard", message: "gone" } });
    expect((await rollup(seed))!.counts.bounced_hard).toBe(1);
  });

  it("stores an inbound email as pending and asks for fetch-inbound", async () => {
    const seed = await seedOrg(m);
    const inbound = m.fake.createFakeReceivedEmail(seed.key, {
      from: "Jane <jane@customer.test>",
      to: [seed.mailbox],
      subject: "Invoice question",
      text: "hi",
    });
    const id = await storeEvent(m, seed, "email.received", inbound.event as never, at(2));
    const out = await m.processing.processWebhookEvent(id);
    expect(out.fetchInbound).toMatchObject({
      orgId: seed.orgId.toHexString(),
      connectionId: seed.connectionId.toHexString(),
    });
    const email = await m.models.EmailModel.findById(out.emailId);
    expect(email).toMatchObject({
      direction: "inbound",
      status: "received",
      contentStatus: "pending",
      messageId: inbound.messageId,
      threadId: null,
    });
    expect(email!.domainId!.equals(seed.domain._id)).toBe(true);
    const inboundStream = await m.models.MetricRollupModel.collection.findOne({
      orgId: seed.orgId,
      granularity: "day",
      "dimension.kind": "stream",
      "dimension.value": "inbound",
    });
    expect(inboundStream!.counts.received).toBe(1);
  });

  it("recomputes sender status from domain events and removes deleted domains", async () => {
    const seed = await seedOrg(m);
    const domainEvent = (type: string, status: string) =>
      storeEvent(m, seed, type, {
        id: seed.domain.resendId,
        name: seed.domain.name,
        status,
        created_at: new Date().toISOString(),
        region: "us-east-1",
      });
    await m.processing.processWebhookEvent(await domainEvent("domain.updated", "failed"));
    let sender = await m.models.SenderModel.findById(seed.sender._id);
    expect(sender).toMatchObject({ status: "domain_unverified", statusReason: "domain_failed" });

    await m.processing.processWebhookEvent(await domainEvent("domain.updated", "verified"));
    sender = await m.models.SenderModel.findById(seed.sender._id);
    expect(sender!.status).toBe("active");
    expect(sender!.statusReason).toBeUndefined();

    await m.processing.processWebhookEvent(await domainEvent("domain.deleted", "verified"));
    sender = await m.models.SenderModel.findById(seed.sender._id);
    expect(sender).toMatchObject({
      status: "domain_unverified",
      statusReason: "domain_deleted_in_resend",
    });
    expect(await m.models.DomainModel.countDocuments({ _id: seed.domain._id })).toBe(0);
  });
});
