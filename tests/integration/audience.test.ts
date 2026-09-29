import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { startTestDb } from "./helpers";
import { ctxFor, loadMail, seedOrg, type Mail, type Seed } from "./mail-helpers";

let stop: () => Promise<void>;
let m: Mail;
let sync: typeof import("@/lib/services/sync");
let contacts: typeof import("@/lib/services/contacts");
let segments: typeof import("@/lib/services/segments");
let topics: typeof import("@/lib/services/topics");
let properties: typeof import("@/lib/services/contact-properties");
let templates: typeof import("@/lib/services/templates");
let broadcasts: typeof import("@/lib/services/broadcasts");
let sendBroadcastJob: typeof import("@/inngest/functions/send-broadcast");
let importJob: typeof import("@/inngest/functions/import-contacts");
let ResendError: typeof import("@/lib/resend/errors").ResendError;

beforeAll(async () => {
  ({ stop } = await startTestDb("audience"));
  m = await loadMail();
  sync = await import("@/lib/services/sync");
  contacts = await import("@/lib/services/contacts");
  segments = await import("@/lib/services/segments");
  topics = await import("@/lib/services/topics");
  properties = await import("@/lib/services/contact-properties");
  templates = await import("@/lib/services/templates");
  broadcasts = await import("@/lib/services/broadcasts");
  sendBroadcastJob = await import("@/inngest/functions/send-broadcast");
  importJob = await import("@/inngest/functions/import-contacts");
  ({ ResendError } = await import("@/lib/resend/errors"));
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

beforeEach(() => {
  m.fake.resetFakeResend();
  m.jobs.resetSentJobs();
});

/** A seeded org whose mirrors were filled by a real sync of the fake Resend team. */
async function seeded() {
  const seed = await seedOrg(m);
  const outcome = await sync.runSyncInline({
    connectionId: seed.connectionId.toHexString(),
    trigger: "manual",
  });
  expect(outcome.status).toBe("done");
  return seed;
}

const owner = (seed: Seed) => ctxFor(m, seed.orgId, "owner");
const hex = (id: Types.ObjectId) => id.toHexString();

/** The fake adapter with chosen methods failing the way Resend would. */
function failing(
  seed: Seed,
  methods: string[],
  code: "resend_validation" | "resend_rate_limited" = "resend_validation",
) {
  const inner = new m.fake.FakeResendAdapter(seed.key);
  const calls: string[] = [];
  const adapter = new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || typeof prop !== "string") return value;
      return (...args: unknown[]) => {
        calls.push(prop);
        if (methods.includes(prop)) {
          return Promise.reject(new ResendError(code, "Resend said no.", { retryAfterSeconds: 0 }));
        }
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { adapter: adapter as import("@/lib/resend/adapter").ResendAdapter, calls };
}

const audit = (seed: Seed, action: string) =>
  m.models.AuditLogModel.countDocuments({ orgId: seed.orgId, action });

describe("permissions", () => {
  it("denies viewer and support what the matrix denies", async () => {
    const seed = await seeded();
    const viewer = ctxFor(m, seed.orgId, "viewer");
    const support = ctxFor(m, seed.orgId, "support");
    const conn = hex(seed.connectionId);

    await expect(contacts.listContacts(viewer)).rejects.toMatchObject({ code: "forbidden" });
    await expect(segments.listSegments(support)).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      segments.createSegment(support, { connectionId: conn, name: "X" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      topics.createTopic(viewer, { connectionId: conn, name: "T" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      properties.createContactProperty(support, { connectionId: conn, key: "k", type: "string" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      contacts.createContact(support, { connectionId: conn, email: "a@b.co" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      contacts.importContactsBatch(support, {
        connectionId: conn,
        rows: [{ row: 2, value: { email: "a@b.co" } }],
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      templates.createTemplate(viewer, { connectionId: conn, name: "T", html: "<p>x</p>" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(templates.listTemplates(support)).rejects.toMatchObject({ code: "forbidden" });
    await expect(broadcasts.listBroadcasts(support)).rejects.toMatchObject({ code: "forbidden" });
    await expect(broadcasts.listBroadcasts(viewer)).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      broadcasts.sendBroadcast(support, { id: hex(new Types.ObjectId()) }),
    ).rejects.toMatchObject({ code: "forbidden" });
    // Viewers may read templates.
    await expect(templates.listTemplates(viewer)).resolves.toHaveLength(3);
  });

  it("lets support read and unsubscribe contacts, but not edit, resubscribe or delete", async () => {
    const seed = await seeded();
    const support = ctxFor(m, seed.orgId, "support");
    const page = await contacts.listContacts(support, { limit: 5 });
    const target = page.items.find((c) => !c.unsubscribed)!;

    await expect(
      contacts.updateContact(support, { id: target.id, firstName: "Nope" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(contacts.deleteContact(support, target.id)).rejects.toMatchObject({
      code: "forbidden",
    });

    const done = await contacts.setContactUnsubscribed(support, {
      id: target.id,
      unsubscribed: true,
    });
    expect(done.unsubscribed).toBe(true);
    expect(new m.fake.FakeResendAdapter(seed.key)).toBeTruthy();
    await expect(
      contacts.setContactUnsubscribed(support, { id: target.id, unsubscribed: false }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await audit(seed, "contact.unsubscribed")).toBe(1);
  });

  it("refuses writes on a read-only connection", async () => {
    const seed = await seeded();
    await m.models.ConnectionModel.updateOne(
      { _id: seed.connectionId },
      { $set: { status: "read_only" } },
    );
    await expect(
      segments.createSegment(owner(seed), { connectionId: hex(seed.connectionId), name: "X" }),
    ).rejects.toMatchObject({
      code: "connection_read_only",
    });
    // Reads still work.
    await expect(contacts.listContacts(owner(seed))).resolves.toBeTruthy();
  });
});

describe("write-through to Resend", () => {
  it("creates in Resend first, then mirrors, audits and publishes", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const created = await segments.createSegment(ctx, {
      connectionId: hex(seed.connectionId),
      name: "VIPs",
    });

    const remote = (await new m.fake.FakeResendAdapter(seed.key).listSegments({ limit: 100 })).data;
    expect(remote.map((s) => s.name)).toContain("VIPs");
    const mirror = await m.models.SegmentModel.findById(created.id);
    expect(mirror?.name).toBe("VIPs");
    expect(await audit(seed, "segment.created")).toBe(1);
    const events = await m.models.RealtimeEventModel.find({
      orgId: seed.orgId,
      topics: "segments",
    });
    expect(events.length).toBeGreaterThan(0);
  });

  it("leaves the mirror, audit log and realtime untouched when Resend fails", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const before = {
      segments: await m.models.SegmentModel.countDocuments({ orgId: seed.orgId }),
      contacts: await m.models.ContactModel.countDocuments({ orgId: seed.orgId }),
      audits: await m.models.AuditLogModel.countDocuments({ orgId: seed.orgId }),
      events: await m.models.RealtimeEventModel.countDocuments({ orgId: seed.orgId }),
    };
    const contact = (await contacts.listContacts(ctx, { limit: 1 })).items[0]!;
    const seg = await m.models.SegmentModel.findOne({ orgId: seed.orgId });

    const bad = failing(seed, [
      "createSegment",
      "createContact",
      "updateContact",
      "deleteContact",
      "deleteSegment",
    ]);
    await expect(
      segments.createSegment(
        ctx,
        { connectionId: hex(seed.connectionId), name: "Nope" },
        { adapter: bad.adapter },
      ),
    ).rejects.toMatchObject({ code: "resend_rejected", message: "Resend said no." });
    await expect(
      contacts.createContact(
        ctx,
        { connectionId: hex(seed.connectionId), email: "new@example.org" },
        { adapter: bad.adapter },
      ),
    ).rejects.toMatchObject({ code: "resend_rejected" });
    await expect(
      contacts.updateContact(
        ctx,
        { id: contact.id, firstName: "Changed" },
        { adapter: bad.adapter },
      ),
    ).rejects.toMatchObject({ code: "resend_rejected" });
    await expect(
      contacts.deleteContact(ctx, contact.id, { adapter: bad.adapter }),
    ).rejects.toMatchObject({ code: "resend_rejected" });
    await expect(
      segments.deleteSegment(ctx, hex(seg!._id), { adapter: bad.adapter }),
    ).rejects.toMatchObject({ code: "resend_rejected" });

    expect(await m.models.SegmentModel.countDocuments({ orgId: seed.orgId })).toBe(before.segments);
    expect(await m.models.ContactModel.countDocuments({ orgId: seed.orgId })).toBe(before.contacts);
    expect((await m.models.ContactModel.findById(contact.id))?.firstName).toBe(contact.firstName);
    expect(await m.models.AuditLogModel.countDocuments({ orgId: seed.orgId })).toBe(before.audits);
    expect(await m.models.RealtimeEventModel.countDocuments({ orgId: seed.orgId })).toBe(
      before.events,
    );
  });

  it("maps a rate limit to a readable error and changes nothing", async () => {
    const seed = await seeded();
    const bad = failing(seed, ["createTopic"], "resend_rate_limited");
    await expect(
      topics.createTopic(
        owner(seed),
        { connectionId: hex(seed.connectionId), name: "T" },
        { adapter: bad.adapter },
      ),
    ).rejects.toMatchObject({ code: "rate_limited" });
    expect(await m.models.TopicModel.countDocuments({ orgId: seed.orgId, name: "T" })).toBe(0);
  });

  it("deletes in Resend before the mirror and cleans references (segment, topic, property)", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const seg = (await m.models.SegmentModel.findOne({ orgId: seed.orgId, name: "Customers" }))!;
    const members = await m.models.ContactModel.countDocuments({
      orgId: seed.orgId,
      segmentIds: seg._id,
    });
    expect(members).toBeGreaterThan(0);

    const spy = failing(seed, []);
    await segments.deleteSegment(ctx, hex(seg._id), { adapter: spy.adapter });
    expect(spy.calls).toContain("deleteSegment");
    expect(await m.models.SegmentModel.countDocuments({ _id: seg._id })).toBe(0);
    expect(
      await m.models.ContactModel.countDocuments({ orgId: seed.orgId, segmentIds: seg._id }),
    ).toBe(0);
    expect(
      (await new m.fake.FakeResendAdapter(seed.key).listSegments({ limit: 100 })).data.map(
        (s) => s.name,
      ),
    ).not.toContain("Customers");

    const property = (await m.models.ContactPropertyModel.findOne({
      orgId: seed.orgId,
      key: "company",
    }))!;
    await properties.deleteContactProperty(ctx, hex(property._id));
    const contact = await m.models.ContactModel.findOne({ orgId: seed.orgId });
    expect(contact?.properties).not.toHaveProperty("company");

    const topic = (await m.models.TopicModel.findOne({
      orgId: seed.orgId,
      name: "Product updates",
    }))!;
    await topics.deleteTopic(ctx, hex(topic._id));
    expect(
      await m.models.ContactModel.countDocuments({
        orgId: seed.orgId,
        "topicSubscriptions.topicId": topic._id,
      }),
    ).toBe(0);
  });

  it("treats a contact already gone in Resend as deleted", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const contact = (await contacts.listContacts(ctx, { limit: 1 })).items[0]!;
    const doc = (await m.models.ContactModel.findById(contact.id))!;
    await new m.fake.FakeResendAdapter(seed.key).deleteContact(doc.resendId);
    await contacts.deleteContact(ctx, contact.id);
    expect(await m.models.ContactModel.countDocuments({ _id: doc._id })).toBe(0);
  });
});

describe("contacts", () => {
  it("creates with properties, segments and topics, and rejects unknown properties", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const conn = hex(seed.connectionId);
    const seg = (await m.models.SegmentModel.findOne({ orgId: seed.orgId, name: "Beta testers" }))!;
    const topic = (await m.models.TopicModel.findOne({
      orgId: seed.orgId,
      name: "Weekly digest",
    }))!;

    await expect(
      contacts.createContact(ctx, {
        connectionId: conn,
        email: "x@y.co",
        properties: { nope: "1" },
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      contacts.createContact(ctx, {
        connectionId: conn,
        email: "x@y.co",
        properties: { plan_seats: "many" },
      }),
    ).rejects.toMatchObject({ code: "validation" });

    const before = seg.contactCount;
    const row = await contacts.createContact(ctx, {
      connectionId: conn,
      email: "New.Person@Example.org",
      firstName: "New",
      properties: { company: "Acme", plan_seats: "5" },
      segmentIds: [hex(seg._id)],
      topicSubscriptions: [{ topicId: hex(topic._id), subscription: "opt_out" }],
    });
    expect(row.email).toBe("new.person@example.org");
    const detail = await contacts.getContact(ctx, row.id);
    expect(detail.properties).toEqual({ company: "Acme", plan_seats: 5 });
    expect(detail.segments.map((s) => s.name)).toEqual(["Beta testers"]);
    expect(detail.topics.find((t) => t.name === "Weekly digest")).toMatchObject({
      subscription: "opt_out",
      isDefault: false,
    });
    expect((await m.models.SegmentModel.findById(seg._id))?.contactCount).toBe(before + 1);
    await expect(
      contacts.createContact(ctx, { connectionId: conn, email: "new.person@example.org" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("edits, changes segments and topic subscriptions, and reads recent emails", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const contact = (await contacts.listContacts(ctx, { q: "person3@" })).items[0]!;
    const customers = (await m.models.SegmentModel.findOne({
      orgId: seed.orgId,
      name: "Customers",
    }))!;
    const digest = (await m.models.TopicModel.findOne({
      orgId: seed.orgId,
      name: "Weekly digest",
    }))!;

    await contacts.updateContact(ctx, {
      id: contact.id,
      firstName: "Renamed",
      properties: { company: null, plan_seats: 9 },
    });
    const edited = await contacts.getContact(ctx, contact.id);
    expect(edited.firstName).toBe("Renamed");
    expect(edited.properties).toEqual({ plan_seats: 9 });

    await contacts.setContactSegments(ctx, { id: contact.id, segmentIds: [hex(customers._id)] });
    expect((await contacts.getContact(ctx, contact.id)).segments.map((s) => s.name)).toEqual([
      "Customers",
    ]);

    await contacts.setContactTopics(ctx, {
      id: contact.id,
      subscriptions: [{ topicId: hex(digest._id), subscription: "opt_in" }],
    });
    expect(
      (await contacts.getContact(ctx, contact.id)).topics.find((t) => t.name === "Weekly digest")
        ?.subscription,
    ).toBe("opt_in");

    // Recent emails come from our own collection.
    await m.models.EmailModel.create({
      orgId: seed.orgId,
      connectionId: seed.connectionId,
      direction: "outbound",
      origin: "app",
      from: { address: seed.mailbox },
      to: [{ address: contact.email }],
      recipientAddresses: [contact.email],
      subject: "Hello there",
      status: "opened",
      deliveredAt: new Date(),
      openCount: 2,
      lastOpenedAt: new Date(),
    });
    const detail = await contacts.getContact(ctx, contact.id);
    expect(detail.recentEmails.map((e) => e.subject)).toEqual(["Hello there"]);
    expect(detail.engagement).toMatchObject({ sent: 1, opened: 1, clicked: 0, bounced: 0 });
    expect(detail.engagement.lastOpenedAt).toBeTruthy();
  });

  it("pages by address, searches and filters by segment, topic and status", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const first = await contacts.listContacts(ctx, { limit: 5 });
    expect(first.items).toHaveLength(5);
    expect(first.nextCursor).toBeTruthy();
    const second = await contacts.listContacts(ctx, { limit: 5, cursor: first.nextCursor! });
    const all = [...first.items, ...second.items].map((c) => c.email);
    expect(new Set(all).size).toBe(10);
    expect([...all].sort()).toEqual(all);

    expect((await contacts.listContacts(ctx, { q: "person11@" })).items).toHaveLength(1);
    const beta = (await m.models.SegmentModel.findOne({
      orgId: seed.orgId,
      name: "Beta testers",
    }))!;
    const betaEmails = (await contacts.listContacts(ctx, { segmentId: hex(beta._id) })).items.map(
      (c) => c.email,
    );
    expect(betaEmails).toHaveLength(2); // every fifth of the fake team's twelve contacts
    expect(betaEmails.every((e) => /person(5|10)@/.test(e))).toBe(true);
    expect(
      (await contacts.listContacts(ctx, { status: "unsubscribed" })).items.every(
        (c) => c.unsubscribed,
      ),
    ).toBe(true);
    const digest = (await m.models.TopicModel.findOne({
      orgId: seed.orgId,
      name: "Weekly digest",
    }))!;
    expect(
      (await contacts.listContacts(ctx, { topicId: hex(digest._id) })).items.length,
    ).toBeGreaterThan(0);
    await expect(contacts.listContacts(ctx, { cursor: "garbage" })).rejects.toMatchObject({
      code: "validation",
    });
  });
});

describe("CSV import", () => {
  const row = (n: number, email: string, extra: Record<string, unknown> = {}) => ({
    row: n,
    value: { email, ...extra },
  });

  it("creates, skips existing, updates when asked, and reports per-row errors", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const conn = hex(seed.connectionId);
    const seg = (await m.models.SegmentModel.findOne({ orgId: seed.orgId, name: "Beta testers" }))!;
    const existing = (await m.models.ContactModel.findOne({ orgId: seed.orgId }))!;

    const result = await contacts.importContactsBatch(ctx, {
      connectionId: conn,
      segmentIds: [hex(seg._id)],
      rows: [
        row(2, "fresh1@import.test", { firstName: "One", properties: { company: "Acme" } }),
        row(3, "fresh2@import.test"),
        row(4, existing.email, { firstName: "Ignored" }),
        row(5, "bad@import.test", { properties: { unknown_prop: "x" } }),
        row(6, "bad2@import.test", { properties: { plan_seats: "lots" } }),
      ],
    });
    expect(result).toMatchObject({
      processed: 5,
      rateLimited: false,
      created: 2,
      updated: 0,
      skipped: 1,
    });
    expect(result.errors.map((e) => e.row)).toEqual([5, 6]);
    expect(result.errors[0]!.message).toMatch(/unknown_prop/);
    expect((await m.models.ContactModel.findById(existing._id))?.firstName).toBe(
      existing.firstName,
    );

    const again = await contacts.importContactsBatch(ctx, {
      connectionId: conn,
      updateExisting: true,
      segmentIds: [hex(seg._id)],
      rows: [row(2, "fresh1@import.test", { firstName: "Uno" })],
    });
    expect(again).toMatchObject({ created: 0, updated: 1 });
    expect(
      (await m.models.ContactModel.findOne({ orgId: seed.orgId, email: "fresh1@import.test" }))
        ?.firstName,
    ).toBe("Uno");
    expect((await m.models.SegmentModel.findById(seg._id))?.contactCount).toBeGreaterThanOrEqual(2);
    const remoteContacts = (
      await new m.fake.FakeResendAdapter(seed.key).listContacts({ limit: 100 })
    ).data;
    expect(remoteContacts.map((c) => c.email)).toContain("fresh2@import.test");
  });

  it("rejects an oversized batch and invalid addresses on the server too", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const conn = hex(seed.connectionId);
    const many = Array.from({ length: 26 }, (_, i) => row(i + 2, `p${i}@x.test`));
    await expect(
      contacts.importContactsBatch(ctx, { connectionId: conn, rows: many }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      contacts.importContactsBatch(ctx, { connectionId: conn, rows: [row(2, "not-an-email")] }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("stops the batch on a lasting rate limit and says how far it got", async () => {
    const seed = await seeded();
    const bad = failing(seed, ["createContact"], "resend_rate_limited");
    const result = await contacts.importContactsBatch(
      owner(seed),
      {
        connectionId: hex(seed.connectionId),
        rows: [row(2, "a@limit.test"), row(3, "b@limit.test")],
      },
      { adapter: bad.adapter },
    );
    expect(result).toMatchObject({ processed: 0, rateLimited: true, created: 0 });
    expect(
      await m.models.ContactModel.countDocuments({ orgId: seed.orgId, email: "a@limit.test" }),
    ).toBe(0);
  });

  it("works through a large upload as a job, batch by batch", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const conn = hex(seed.connectionId);
    const { importId } = await contacts.createContactImport(ctx, { connectionId: conn, total: 60 });
    const rows = Array.from({ length: 60 }, (_, i) =>
      row(i + 2, `bulk${i}@job.test`, i === 7 ? { properties: { nope: "1" } } : {}),
    );
    await contacts.appendImportRows(ctx, { importId, rows: rows.slice(0, 30) });
    await contacts.appendImportRows(ctx, { importId, rows: rows.slice(30) });
    const started = await contacts.startContactImport(ctx, importId);
    expect(started.total).toBe(60);
    expect(m.jobs.sentJobs.map((j) => j.name)).toContain("audience/contacts.import.requested");

    const step = { run: <T>(_id: string, fn: () => Promise<T>) => fn(), sleep: async () => {} };
    const outcome = await importJob.runImportLoop(step, { importId });
    expect(outcome).toMatchObject({ status: "done", batches: 3 });
    const status = await contacts.getContactImport(ctx, importId);
    expect(status).toMatchObject({
      status: "completed",
      processed: 60,
      created: 59,
      errorCount: 1,
    });
    expect(status.errors[0]).toMatchObject({ row: 9 });
    expect(
      await m.models.ContactModel.countDocuments({ orgId: seed.orgId, email: /@job\.test$/ }),
    ).toBe(59);
    expect(await audit(seed, "contact.imported")).toBe(1);
    // Another member cannot read it.
    await expect(contacts.getContactImport(owner(seed), importId)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("templates", () => {
  const conn = (seed: Seed) => hex(seed.connectionId);

  it("creates a draft, detects variables, saves with a version check, publishes and duplicates", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const created = await templates.createTemplate(ctx, {
      connectionId: conn(seed),
      name: "Receipt",
      subject: "Receipt for {{{NAME}}}",
      html: "<p>Hi {{{NAME}}}, you paid {{{AMOUNT}}}. {{{RESEND_UNSUBSCRIBE_URL}}}</p>",
      variables: [{ key: "NAME", type: "string", fallback: "there" }],
    });
    expect(created.status).toBe("draft");
    expect(created.variables.map((v) => v.key)).toEqual(["NAME", "AMOUNT"]);
    const remote = await new m.fake.FakeResendAdapter(seed.key).getTemplate(
      (await m.models.TemplateModel.findById(created.id))!.resendId,
    );
    expect(remote.variables.map((v) => v.key)).toEqual(["NAME", "AMOUNT"]);

    const saved = await templates.updateTemplate(ctx, {
      id: created.id,
      version: created.version,
      name: "Receipt v2",
      subject: created.subject,
      html: created.html,
      variables: created.variables,
      publish: true,
    });
    expect(saved).toMatchObject({ name: "Receipt v2", status: "published" });
    await expect(
      templates.updateTemplate(ctx, {
        id: created.id,
        version: created.version,
        name: "Stale",
        html: created.html,
        variables: [],
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    const copy = await templates.duplicateTemplate(ctx, { id: created.id });
    expect(copy).toMatchObject({ name: "Receipt v2 (copy)", status: "draft" });
    await templates.deleteTemplate(ctx, copy.id);
    expect(await m.models.TemplateModel.countDocuments({ _id: copy.id })).toBe(0);
    expect(await audit(seed, "template.published")).toBe(1);
  });

  it("sends a published template through sendEmail with variables", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const created = await templates.createTemplate(ctx, {
      connectionId: conn(seed),
      name: "Hello",
      subject: "Hello {{{NAME}}}",
      html: "<p>Hi {{{NAME}}} from {{{TEAM}}}</p>",
      variables: [
        { key: "NAME", type: "string", fallback: null },
        { key: "TEAM", type: "string", fallback: "Wisemail" },
      ],
    });
    const base = {
      senderId: hex(seed.sender._id),
      to: ["jane@customer.test"],
      subject: "Hello {{{NAME}}}",
      templateId: created.id,
      templateVariables: { NAME: "Jane <b>" },
    };
    // Drafts cannot be sent.
    await expect(m.sending.sendEmail(ctx, base)).rejects.toMatchObject({
      code: "template_unpublished",
    });
    await templates.updateTemplate(ctx, {
      id: created.id,
      version: created.version,
      name: "Hello",
      subject: created.subject,
      html: created.html,
      variables: created.variables,
      publish: true,
    });

    // A variable without a fallback must be filled.
    await expect(
      m.sending.sendEmail(ctx, { ...base, templateVariables: {} }),
    ).rejects.toMatchObject({
      code: "validation",
      fieldErrors: { "templateVariables.NAME": [expect.stringContaining("NAME")] },
    });

    const result = await m.sending.sendEmail(ctx, base);
    expect(result.status).toBe("sent");
    const sent = m.fake.fakeSentEmails(seed.key).at(-1)!;
    const tpl = (await m.models.TemplateModel.findById(created.id))!;
    expect(sent.input.template).toEqual({ id: tpl.resendId, variables: { NAME: "Jane <b>" } });
    expect(sent.input.html).toBeUndefined();
    expect(sent.input.subject).toBe("Hello Jane <b>");

    const email = (await m.models.EmailModel.findById(result.emailId))!;
    expect(email.templateId?.toHexString()).toBe(created.id);
    const contents = await m.models.EmailContentModel.findOne({ emailId: email._id });
    expect(contents?.html).toContain("Hi Jane &lt;b&gt; from Wisemail");
  });

  it("does not use a template from another connection", async () => {
    const seed = await seeded();
    const other = await seedOrg(m);
    await sync.runSyncInline({ connectionId: hex(other.connectionId), trigger: "manual" });
    const foreign = (await m.models.TemplateModel.findOne({
      orgId: other.orgId,
      status: "published",
    }))!;
    await expect(
      m.sending.sendEmail(owner(seed), {
        senderId: hex(seed.sender._id),
        to: ["jane@customer.test"],
        subject: "x",
        templateId: hex(foreign._id),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("broadcasts", () => {
  async function draft(seed: Seed, overrides: Record<string, unknown> = {}) {
    const ctx = owner(seed);
    const customers = (await m.models.SegmentModel.findOne({
      orgId: seed.orgId,
      name: "Customers",
    }))!;
    return broadcasts.createBroadcast(ctx, {
      connectionId: hex(seed.connectionId),
      name: "October news",
      segmentId: hex(customers._id),
      senderId: hex(seed.sender._id),
      subject: "News",
      html: "<p>Hello {{{FIRST_NAME|there}}}</p><p><a href='{{{RESEND_UNSUBSCRIBE_URL}}}'>Unsubscribe</a></p>",
      ...overrides,
    });
  }

  it("creates and edits a draft (Resend first), warns about a missing unsubscribe link", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const created = await draft(seed, { html: "<p>No opt out here</p>" });
    expect(created).toMatchObject({ status: "draft", name: "October news" });
    expect(created.warnings.join(" ")).toMatch(/unsubscribe/i);
    const remote = await new m.fake.FakeResendAdapter(seed.key).getBroadcast(
      (await m.models.BroadcastModel.findById(created.id))!.resendId!,
    );
    expect(remote.subject).toBe("News");
    expect(remote.from).toContain(seed.mailbox);

    const updated = await broadcasts.updateBroadcast(ctx, {
      id: created.id,
      version: created.version,
      name: "October news",
      segmentId: created.segmentId!,
      senderId: created.senderId!,
      subject: "News v2",
      html: "<p>{{{RESEND_UNSUBSCRIBE_URL}}}</p>",
    });
    expect(updated.subject).toBe("News v2");
    expect(updated.warnings).toEqual([]);
    await expect(
      broadcasts.updateBroadcast(ctx, {
        id: created.id,
        version: created.version,
        name: "x",
        segmentId: created.segmentId!,
        senderId: created.senderId!,
        subject: "s",
        html: "<p>x</p>",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    const bad = failing(seed, ["updateBroadcast"]);
    await expect(
      broadcasts.updateBroadcast(
        ctx,
        {
          id: created.id,
          version: updated.version,
          name: "x",
          segmentId: created.segmentId!,
          senderId: created.senderId!,
          subject: "Lost",
          html: "<p>x</p>",
        },
        { adapter: bad.adapter },
      ),
    ).rejects.toMatchObject({ code: "resend_rejected" });
    expect((await broadcasts.getBroadcast(ctx, created.id)).subject).toBe("News v2");
  });

  it("schedules, then cancels; Resend and the mirror agree, jobs and audit are written", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const created = await draft(seed);
    const at = new Date(Date.now() + 3 * 3600_000);

    const audience = await broadcasts.getBroadcastAudience(ctx, created.id);
    expect(audience.recipients).toBeGreaterThan(0);
    expect(audience.segmentName).toBe("Customers");

    const scheduled = await broadcasts.sendBroadcast(ctx, { id: created.id, scheduledAt: at });
    expect(scheduled.status).toBe("scheduled");
    expect(new Date(scheduled.scheduledAt!).getTime()).toBe(at.getTime());
    const resendId = (await m.models.BroadcastModel.findById(created.id))!.resendId!;
    expect((await new m.fake.FakeResendAdapter(seed.key).getBroadcast(resendId)).status).toBe(
      "scheduled",
    );
    expect(m.jobs.sentJobs.map((j) => j.name)).toContain("broadcast/send.requested");
    expect(await audit(seed, "broadcast.scheduled")).toBe(1);

    // Scheduled broadcasts cannot be edited or sent again.
    await expect(broadcasts.sendBroadcast(ctx, { id: created.id })).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(
      broadcasts.updateBroadcast(ctx, {
        id: created.id,
        version: scheduled.version,
        name: "x",
        segmentId: created.segmentId!,
        senderId: created.senderId!,
        subject: "s",
        html: "<p>x</p>",
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    // A failing cancel changes nothing.
    const bad = failing(seed, ["cancelBroadcast"]);
    await expect(
      broadcasts.cancelBroadcast(ctx, created.id, { adapter: bad.adapter }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await broadcasts.getBroadcast(ctx, created.id)).status).toBe("scheduled");

    const canceled = await broadcasts.cancelBroadcast(ctx, created.id);
    expect(canceled.status).toBe("canceled");
    expect((await new m.fake.FakeResendAdapter(seed.key).getBroadcast(resendId)).status).toBe(
      "canceled",
    );
    expect(await audit(seed, "broadcast.canceled")).toBe(1);
    await expect(broadcasts.cancelBroadcast(ctx, created.id)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("blocks empty audiences, past times and unusable senders", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    // The segment exists in Resend (the fake) and here, with nobody in it.
    const remote = await new m.fake.FakeResendAdapter(seed.key).createSegment({ name: "Empty" });
    const empty = await m.models.SegmentModel.create({
      orgId: seed.orgId,
      connectionId: seed.connectionId,
      resendId: remote.id,
      name: "Empty",
      contactCount: 0,
    });
    const b = await draft(seed, { segmentId: hex(empty._id) });
    await expect(broadcasts.sendBroadcast(ctx, { id: b.id })).rejects.toMatchObject({
      code: "segment_empty",
    });
    await expect(
      broadcasts.sendBroadcast(ctx, { id: b.id, scheduledAt: new Date(Date.now() - 1000) }),
    ).rejects.toMatchObject({ code: "validation" });

    const ok = await draft(seed);
    await m.models.SenderModel.updateOne(
      { _id: seed.sender._id },
      { $set: { status: "disabled" } },
    );
    await expect(broadcasts.sendBroadcast(ctx, { id: ok.id })).rejects.toMatchObject({
      code: "sender_inactive",
    });
    expect((await broadcasts.getBroadcast(ctx, ok.id)).warnings.join(" ")).toMatch(/disabled/i);
    await m.models.SenderModel.updateOne({ _id: seed.sender._id }, { $set: { status: "active" } });
  });

  it("excludes unsubscribed contacts and topic opt-outs from the audience", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const digest = (await m.models.TopicModel.findOne({
      orgId: seed.orgId,
      name: "Weekly digest",
    }))!; // opt_out by default
    const news = (await m.models.TopicModel.findOne({
      orgId: seed.orgId,
      name: "Product updates",
    }))!; // opt_in by default
    const plain = await draft(seed);
    const withNews = await draft(seed, { topicId: hex(news._id) });
    const withDigest = await draft(seed, { topicId: hex(digest._id) });
    const a = await broadcasts.getBroadcastAudience(ctx, plain.id);
    const b = await broadcasts.getBroadcastAudience(ctx, withNews.id);
    const c = await broadcasts.getBroadcastAudience(ctx, withDigest.id);
    expect(a.recipients).toBe(a.inSegment - a.unsubscribed);
    expect(b.recipients).toBe(a.recipients); // nobody opted out of Product updates
    expect(c.recipients).toBeLessThan(a.recipients); // only explicit opt-ins get the opt-out topic
    expect(c.optedOutOfTopic).toBe(a.recipients - c.recipients);
  });

  it("sends now, follows the job to the final status, and computes stats from broadcast emails", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const created = await draft(seed);
    const sent = await broadcasts.sendBroadcast(ctx, { id: created.id });
    expect(["queued", "sending", "sent"]).toContain(sent.status);

    const step = {
      run: <T>(_id: string, fn: () => Promise<T>) => fn(),
      sleep: async () => {},
      sleepUntil: async () => {},
    };
    const final = await sendBroadcastJob.followBroadcast(step, { broadcastId: created.id });
    expect(final.status).toBe("sent");
    expect((await broadcasts.getBroadcast(ctx, created.id)).sentAt).toBeTruthy();

    await m.models.EmailModel.create([
      {
        orgId: seed.orgId,
        connectionId: seed.connectionId,
        direction: "outbound",
        origin: "broadcast",
        broadcastId: new Types.ObjectId(created.id),
        from: { address: seed.mailbox },
        to: [{ address: "a@x.test" }],
        recipientAddresses: ["a@x.test"],
        status: "clicked",
        deliveredAt: new Date(),
        openCount: 2,
        clickCount: 1,
      },
      {
        orgId: seed.orgId,
        connectionId: seed.connectionId,
        direction: "outbound",
        origin: "broadcast",
        broadcastId: new Types.ObjectId(created.id),
        from: { address: seed.mailbox },
        to: [{ address: "b@x.test" }],
        recipientAddresses: ["b@x.test"],
        status: "bounced",
        bouncedAt: new Date(),
      },
    ]);
    const detail = await broadcasts.getBroadcast(ctx, created.id);
    expect(detail.stats).toEqual({
      recipients: 2,
      delivered: 1,
      opened: 1,
      clicked: 1,
      bounced: 1,
      complained: 0,
    });
    const list = await broadcasts.listBroadcasts(ctx, { status: "sent" });
    expect(list.find((b) => b.id === created.id)?.stats?.recipients).toBe(2);
  });

  it("deletes drafts in Resend, and only removes sent broadcasts from Wisemail", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const d = await draft(seed);
    const resendId = (await m.models.BroadcastModel.findById(d.id))!.resendId!;
    const bad = failing(seed, ["deleteBroadcast"]);
    await expect(
      broadcasts.deleteBroadcast(ctx, d.id, { adapter: bad.adapter }),
    ).rejects.toMatchObject({ code: "resend_rejected" });
    expect(await m.models.BroadcastModel.countDocuments({ _id: d.id })).toBe(1);
    expect(await broadcasts.deleteBroadcast(ctx, d.id)).toEqual({ removedInResend: true });
    expect(await m.models.BroadcastModel.countDocuments({ _id: d.id })).toBe(0);
    await expect(
      new m.fake.FakeResendAdapter(seed.key).getBroadcast(resendId),
    ).rejects.toBeTruthy();

    const sentSeed = (await m.models.BroadcastModel.findOne({
      orgId: seed.orgId,
      status: "sent",
    }))!;
    const spy = failing(seed, []);
    expect(
      await broadcasts.deleteBroadcast(ctx, hex(sentSeed._id), { adapter: spy.adapter }),
    ).toEqual({ removedInResend: false });
    expect(spy.calls).not.toContain("deleteBroadcast");
    expect(await audit(seed, "broadcast.removed")).toBe(1);
  });

  it("sends a test email through the sender", async () => {
    const seed = await seeded();
    const ctx = owner(seed);
    const b = await draft(seed);
    const { to } = await broadcasts.sendBroadcastTest(ctx, { id: b.id });
    expect(to).toBe("owner@x.com");
    const sent = m.fake.fakeSentEmails(seed.key).at(-1)!;
    expect(sent.input.subject).toBe("[Test] News");
    expect(sent.input.to).toEqual(["owner@x.com"]);
  });
});

describe("tenant isolation", () => {
  it("never shows another org's contacts, segments, templates or broadcasts", async () => {
    const a = await seeded();
    const b = await seeded();
    const ctxA = owner(a);
    const listA = await contacts.listContacts(ctxA, { limit: 100 });
    const ids = new Set(
      (await m.models.ContactModel.find({ orgId: a.orgId }, { _id: 1 })).map((c) =>
        hex(c._id as Types.ObjectId),
      ),
    );
    expect(listA.items.every((c) => ids.has(c.id))).toBe(true);

    const foreign = (await m.models.ContactModel.findOne({ orgId: b.orgId }))!;
    await expect(contacts.getContact(ctxA, hex(foreign._id))).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(contacts.deleteContact(ctxA, hex(foreign._id))).rejects.toMatchObject({
      code: "not_found",
    });
    expect(
      (await contacts.listContacts(ctxA, { connectionId: hex(b.connectionId) })).items,
    ).toHaveLength(0);
    await expect(
      segments.createSegment(ctxA, { connectionId: hex(b.connectionId), name: "X" }),
    ).rejects.toMatchObject({ code: "not_found" });
    const foreignTemplate = (await m.models.TemplateModel.findOne({ orgId: b.orgId }))!;
    await expect(templates.getTemplate(ctxA, hex(foreignTemplate._id))).rejects.toMatchObject({
      code: "not_found",
    });
    const foreignBroadcast = (await m.models.BroadcastModel.findOne({ orgId: b.orgId }))!;
    await expect(broadcasts.getBroadcast(ctxA, hex(foreignBroadcast._id))).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("hides connections outside a project-scoped member's projects", async () => {
    const seed = await seeded();
    const scoped = ctxFor(m, seed.orgId, "developer", {
      projectScope: [hex(new Types.ObjectId())],
    });
    expect((await contacts.listContacts(scoped)).items).toHaveLength(0);
    expect(await segments.listSegments(scoped)).toHaveLength(0);
    expect(await templates.listTemplates(scoped)).toHaveLength(0);
    expect(await broadcasts.listBroadcasts(scoped)).toHaveLength(0);
  });
});
