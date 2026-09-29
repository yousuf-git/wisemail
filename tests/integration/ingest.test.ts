import { Types } from "mongoose";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { startTestDb, uniqueEmail } from "./helpers";

const headerState = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => headerState.current,
  cookies: async () => ({ set() {}, get() {}, delete() {}, getAll: () => [] }),
}));

const queue = vi.hoisted(() => ({ down: false }));
vi.mock("@/lib/jobs/send", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/jobs/send")>();
  return {
    ...original,
    enqueueEventReceived: (eventId: string) =>
      queue.down ? Promise.reject(new Error("queue down")) : original.enqueueEventReceived(eventId),
  };
});

let stop: () => Promise<void>;
let auth: typeof import("@/lib/auth/server").auth;
let models: typeof import("@/lib/db/models");
let dal: typeof import("@/lib/dal");
let svc: typeof import("@/lib/services/connections");
let fake: typeof import("@/lib/resend/fake-adapter");
let jobs: typeof import("@/lib/jobs/send");
let events: typeof import("@/lib/resend/events");
let route: typeof import("@/app/api/ingest/resend/[connectionId]/route");
let ingestSvc: typeof import("@/lib/services/ingest");
let connect: typeof import("@/lib/db/connect");
let processEvent: typeof import("@/lib/services/webhook-events");

beforeAll(async () => {
  ({ stop } = await startTestDb("ingest"));
  connect = await import("@/lib/db/connect");
  auth = (await import("@/lib/auth/server")).auth;
  models = await import("@/lib/db/models");
  dal = await import("@/lib/dal");
  svc = await import("@/lib/services/connections");
  fake = await import("@/lib/resend/fake-adapter");
  jobs = await import("@/lib/jobs/send");
  events = await import("@/lib/resend/events");
  route = await import("@/app/api/ingest/resend/[connectionId]/route");
  ingestSvc = await import("@/lib/services/ingest");
  processEvent = await import("@/lib/services/webhook-events");
  await connect.connectDb();
  await models.WebhookEventModel.init();
}, 120_000);

afterAll(async () => {
  await connect?.disconnectDb();
  await stop?.();
});

beforeEach(() => {
  fake.resetFakeResend();
  jobs.resetSentJobs();
});

async function connection(team: string) {
  const res = await auth.api.signUpEmail({
    body: { name: "Ingest", email: uniqueEmail("ingest"), password: "correct horse battery" },
    returnHeaders: true,
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const headers = new Headers({ cookie });
  const slug = `ing-${team}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await auth.api.createOrganization({ headers, body: { name: slug, slug } });
  headerState.current = headers;
  const result = await dal.getOrgContext(slug);
  if (result.status !== "ok") throw new Error("no ctx");
  const dto = await svc.addConnection(result.ctx, { name: team, apiKey: `re_${team}_full` });
  jobs.resetSentJobs();
  const secret = (await svc.readWebhookSigningSecret(dto.id))!;
  return { id: dto.id, secret, orgId: new Types.ObjectId(org.id) };
}

const sample = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "email.delivered",
    created_at: new Date().toISOString(),
    data: {
      email_id: "em_123",
      created_at: new Date().toISOString(),
      from: "Acme <hi@acme.com>",
      to: ["jane@example.com"],
      subject: "Hello",
    },
    ...over,
  });

function post(connectionId: string, body: string, headers: Record<string, string>) {
  const req = new NextRequest(`http://localhost:3000/api/ingest/resend/${connectionId}`, {
    method: "POST",
    body,
    headers,
  });
  return route.POST(req, { params: Promise.resolve({ connectionId }) });
}

describe("POST /api/ingest/resend/[connectionId]", () => {
  it("accepts a valid signature: 200, stores the event, updates lastEventAt, enqueues the job", async () => {
    const c = await connection("okay");
    const body = sample();
    const res = await post(c.id, body, events.signWebhook(c.secret, body, { id: "msg_ok" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const stored = await models.WebhookEventModel.find({ connectionId: c.id }).lean();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      svixId: "msg_ok",
      type: "email.delivered",
      resendObjectId: "em_123",
      processedAt: null,
      emailId: null,
      payload: expect.objectContaining({ email_id: "em_123", subject: "Hello" }),
    });
    expect(stored[0]!.orgId.equals(c.orgId)).toBe(true);
    expect(stored[0]!.expireAt.getTime()).toBeGreaterThan(Date.now());

    const conn = await models.ConnectionModel.findById(c.id).lean();
    expect(conn!.lastEventAt).toBeInstanceOf(Date);
    expect(jobs.sentJobs).toEqual([
      { name: "resend/event.received", data: { eventId: stored[0]!._id.toHexString() } },
    ]);

    // `process-event` marks it processed (and upserts the email), idempotently.
    expect(await processEvent.processWebhookEvent(stored[0]!._id.toHexString())).toMatchObject({
      found: true,
      type: "email.delivered",
    });
    expect(
      (await models.WebhookEventModel.findById(stored[0]!._id).lean())!.processedAt,
    ).toBeInstanceOf(Date);
    expect(await processEvent.processWebhookEvent(stored[0]!._id.toHexString())).toMatchObject({
      found: true,
    });
  });

  it("rejects a bad signature with 400 and stores nothing", async () => {
    const c = await connection("badsig");
    const body = sample();
    const headers = events.signWebhook(c.secret, body);
    const tampered = await post(c.id, body.replace("Hello", "Hacked"), headers);
    expect(tampered.status).toBe(400);
    const missing = await post(c.id, body, { "content-type": "application/json" });
    expect(missing.status).toBe(400);
    const wrongSecret = await post(
      c.id,
      body,
      events.signWebhook(`whsec_${Buffer.alloc(32, 1).toString("base64")}`, body),
    );
    expect(wrongSecret.status).toBe(400);
    const stale = await post(
      c.id,
      body,
      events.signWebhook(c.secret, body, { timestamp: new Date(Date.now() - 10 * 60_000) }),
    );
    expect(stale.status).toBe(400);
    expect(await models.WebhookEventModel.countDocuments({ connectionId: c.id })).toBe(0);
    expect(jobs.sentJobs).toHaveLength(0);
  });

  it("acknowledges a duplicate svix-id with 200 and keeps one document and one job", async () => {
    const c = await connection("dupes");
    const body = sample();
    const headers = events.signWebhook(c.secret, body, { id: "msg_dup" });
    expect((await post(c.id, body, headers)).status).toBe(200);
    const again = await post(c.id, body, headers);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, duplicate: true });
    expect(await models.WebhookEventModel.countDocuments({ connectionId: c.id })).toBe(1);
    expect(jobs.sentJobs).toHaveLength(1);
  });

  it("answers 404 for unknown, malformed and removed connections", async () => {
    const c = await connection("gone404");
    const body = sample();
    const headers = events.signWebhook(c.secret, body);
    expect((await post(new Types.ObjectId().toHexString(), body, headers)).status).toBe(404);
    expect((await post("not-an-object-id", body, headers)).status).toBe(404);

    await models.ConnectionModel.updateOne({ _id: c.id }, { deletedAt: new Date() });
    expect((await post(c.id, body, headers)).status).toBe(404);
  });

  it("answers 503 (retryable) while the signing secret is not stored yet", async () => {
    const c = await connection("notready");
    await models.ConnectionModel.updateOne({ _id: c.id }, { $unset: { webhook: 1 } });
    const body = sample();
    expect((await post(c.id, body, events.signWebhook(c.secret, body))).status).toBe(503);
  });

  it("answers 413 for oversized bodies, by header and by actual size", async () => {
    const c = await connection("big");
    const big = sample({ pad: "x".repeat(ingestSvc.MAX_INGEST_BYTES) });
    const signed = events.signWebhook(c.secret, big);
    const res = await post(c.id, big, signed);
    expect(res.status).toBe(413);

    // A lying content-length header does not get around the limit.
    const req = new NextRequest(`http://localhost:3000/api/ingest/resend/${c.id}`, {
      method: "POST",
      body: big,
      headers: { ...signed, "content-length": "10" },
    });
    expect(
      (await route.POST(req, { params: Promise.resolve({ connectionId: c.id }) })).status,
    ).toBe(413);
    expect(await models.WebhookEventModel.countDocuments({ connectionId: c.id })).toBe(0);
  });

  it("tenant isolation: connection A's secret cannot sign for connection B", async () => {
    const a = await connection("tenanta");
    const b = await connection("tenantb");
    expect(a.secret).not.toBe(b.secret);
    const body = sample();

    const forged = await post(b.id, body, events.signWebhook(a.secret, body, { id: "msg_x" }));
    expect(forged.status).toBe(400);
    expect(await models.WebhookEventModel.countDocuments({ connectionId: b.id })).toBe(0);

    // Each secret works for its own connection, and events are stored under their own org.
    expect(
      (await post(a.id, body, events.signWebhook(a.secret, body, { id: "msg_a" }))).status,
    ).toBe(200);
    expect(
      (await post(b.id, body, events.signWebhook(b.secret, body, { id: "msg_a" }))).status,
    ).toBe(200);
    const [ea] = await models.WebhookEventModel.find({ connectionId: a.id }).lean();
    const [eb] = await models.WebhookEventModel.find({ connectionId: b.id }).lean();
    expect(ea!.orgId.equals(a.orgId)).toBe(true);
    expect(eb!.orgId.equals(b.orgId)).toBe(true);
    // Same svix-id on two connections is not a duplicate: uniqueness is per connection.
  });

  it("stores unknown-but-signed event types", async () => {
    const c = await connection("future");
    const body = sample({ type: "something.new", data: { id: "x1" } });
    expect(
      (await post(c.id, body, events.signWebhook(c.secret, body, { id: "msg_f" }))).status,
    ).toBe(200);
    expect(await models.WebhookEventModel.findOne({ svixId: "msg_f" })).toMatchObject({
      type: "something.new",
      resendObjectId: "x1",
    });
  });

  it("if the job cannot be enqueued: 500 and nothing stored, so Resend's retry starts clean", async () => {
    const c = await connection("queuedown");
    const body = sample();
    const headers = events.signWebhook(c.secret, body, { id: "msg_q" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    queue.down = true;
    try {
      expect((await post(c.id, body, headers)).status).toBe(500);
    } finally {
      queue.down = false;
      spy.mockRestore();
    }
    expect(await models.WebhookEventModel.countDocuments({ connectionId: c.id })).toBe(0);
    // The retry (same svix-id) is processed normally.
    expect((await post(c.id, body, headers)).status).toBe(200);
    expect(await models.WebhookEventModel.countDocuments({ connectionId: c.id })).toBe(1);
    expect(jobs.sentJobs).toHaveLength(1);
  });
});
