import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { startTestDb } from "./helpers";

let stop: () => Promise<void>;
let connect: typeof import("@/lib/db/connect");
let models: typeof import("@/lib/db/models");
let sync: typeof import("@/lib/services/sync");
let detail: typeof import("@/lib/services/connection-detail");
let fixes: typeof import("@/lib/services/checklist-fixes");
let fake: typeof import("@/lib/resend/fake-adapter");
let jobs: typeof import("@/lib/jobs/send");
let envelope: typeof import("@/lib/crypto/envelope");
let hook: typeof import("@/lib/services/webhook-secret");
let perms: typeof import("@/lib/auth/permissions");
let fn: typeof import("@/inngest/functions/sync-connection");
type OrgContext = import("@/lib/dal").OrgContext;
type Role = import("@/lib/auth/permissions").Role;
type Permission = import("@/lib/auth/permissions").Permission;
type ConnectionStatus = import("@/lib/db/models/connections").ConnectionStatus;
type ResendAdapter = import("@/lib/resend/adapter").ResendAdapter;

beforeAll(async () => {
  ({ stop } = await startTestDb("sync"));
  connect = await import("@/lib/db/connect");
  models = await import("@/lib/db/models");
  sync = await import("@/lib/services/sync");
  detail = await import("@/lib/services/connection-detail");
  fixes = await import("@/lib/services/checklist-fixes");
  fake = await import("@/lib/resend/fake-adapter");
  jobs = await import("@/lib/jobs/send");
  envelope = await import("@/lib/crypto/envelope");
  hook = await import("@/lib/services/webhook-secret");
  perms = await import("@/lib/auth/permissions");
  fn = await import("@/inngest/functions/sync-connection");
  await connect.connectDb();
  await Promise.all(
    Object.values(models).map((m) => (m as { init?: () => Promise<unknown> }).init?.()),
  );
}, 120_000);

afterAll(async () => {
  await connect?.disconnectDb();
  await stop?.();
});

beforeEach(() => {
  fake.resetFakeResend();
  jobs.resetSentJobs();
});

/* ------------------------------------------------------------------ helpers */

let teamCounter = 0;
/** A fresh fake team name (fake data is per team) with optional behaviour flags. */
const team = (flags = "") => {
  const name = `t${++teamCounter}`;
  return { name, key: `re_${name}_full${flags ? `_${flags}` : ""}` };
};

async function newConnection(
  orgId: Types.ObjectId,
  key: string,
  options: { webhook?: boolean; status?: ConnectionStatus; lastEventAt?: Date } = {},
) {
  const _id = new Types.ObjectId();
  const adapter = new fake.FakeResendAdapter(key);
  const webhook =
    options.webhook === false
      ? undefined
      : await adapter
          .createWebhook({ endpoint: `http://localhost/${_id}`, events: ["email.sent"] })
          .then((w) => ({
            resendId: w.id,
            signingSecret: envelope.encryptSecret(w.signingSecret, { aad: hook.secretAad(_id) }),
            events: ["email.sent"],
            registeredAt: new Date(),
          }));
  await models.ConnectionModel.create({
    _id,
    orgId,
    name: `conn-${_id}`,
    resendTeamFingerprint: `fp-${_id}`,
    createdBy: new Types.ObjectId(),
    status: options.status ?? "active",
    apiKey: envelope.encryptSecret(key, { aad: hook.keyAad(_id) }),
    apiKeyLast4: key.slice(-4),
    webhook,
    lastEventAt: options.lastEventAt,
  });
  return { id: _id, hex: _id.toHexString() };
}

function ctxFor(orgId: Types.ObjectId, role: Role = "owner"): OrgContext {
  return {
    user: {
      id: new Types.ObjectId().toHexString(),
      name: role,
      email: `${role}@x.com`,
      image: null,
    },
    org: { id: orgId.toHexString(), name: "Org", slug: "org" },
    role,
    orgs: [],
    memberId: new Types.ObjectId().toHexString(),
    projectScope: null,
    can: (permission: Permission) => perms.roleHasPermission(role, permission),
  } as unknown as OrgContext;
}

const run = (connectionId: string, trigger: "initial" | "manual" = "manual") =>
  sync.runSyncInline({ connectionId, trigger });

const scope = (orgId: Types.ObjectId, connectionId: Types.ObjectId) => ({ orgId, connectionId });

/** Wraps an adapter to record calls and optionally fail some of them. */
function spied(
  key: string,
  options: { fail?: (method: string, args: unknown[], count: number) => Error | undefined } = {},
) {
  const inner = new fake.FakeResendAdapter(key);
  const calls: { method: string; args: unknown[] }[] = [];
  const counts = new Map<string, number>();
  const adapter = new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const method = String(prop);
        const count = (counts.get(method) ?? 0) + 1;
        counts.set(method, count);
        calls.push({ method, args });
        const error = options.fail?.(method, args, count);
        if (error) return Promise.reject(error);
        return value.apply(target, args);
      };
    },
  }) as unknown as ResendAdapter;
  return { adapter, calls, of: (method: string) => calls.filter((c) => c.method === method) };
}

async function resendError(
  code: import("@/lib/resend/types").ResendErrorCode,
  retryAfter?: number,
) {
  const { ResendError } = await import("@/lib/resend/errors");
  return new ResendError(code, `fake ${code}`, { retryAfterSeconds: retryAfter });
}

const latestRun = (connectionId: Types.ObjectId) =>
  models.SyncRunModel.findOne({ connectionId }).sort({ startedAt: -1 }).lean();

/* -------------------------------------------------------------------- tests */

describe("sync: stages upsert the mirrors", () => {
  it("syncs every resource of a seeded account, completes the run and stamps the connection", async () => {
    const orgId = new Types.ObjectId();
    const { key } = team();
    const conn = await newConnection(orgId, key);
    const outcome = await run(conn.hex, "initial");
    expect(outcome).toEqual({ status: "done" });

    const s = scope(orgId, conn.id);
    expect(await models.DomainModel.countDocuments(s)).toBe(3);
    expect(await models.ApiKeyModel.countDocuments(s)).toBe(3); // two seeded + our own key
    expect(await models.SegmentModel.countDocuments(s)).toBe(3);
    expect(await models.TopicModel.countDocuments(s)).toBe(2);
    expect(await models.ContactPropertyModel.countDocuments(s)).toBe(2);
    expect(await models.TemplateModel.countDocuments(s)).toBe(3);
    expect(await models.ContactModel.countDocuments(s)).toBe(12);
    expect(await models.BroadcastModel.countDocuments(s)).toBe(2);
    expect(await models.AutomationModel.countDocuments(s)).toBe(2);

    const doc = await models.ConnectionModel.findById(conn.id).lean();
    expect(doc!.lastSyncAt).toBeInstanceOf(Date);
    const last = await latestRun(conn.id);
    expect(last).toMatchObject({ status: "completed", trigger: "initial" });
    expect(last!.resources.every((r) => r.status === "completed")).toBe(true);
    expect(last!.resources.map((r) => r.name)).toEqual(sync.SYNC_STAGE_ORDER);
    expect(last!.resources.find((r) => r.name === "contacts")!.count).toBe(12);
    expect(last!.resources.find((r) => r.name === "contacts")!.cursor).toBeUndefined();
  });

  it("maps domains (records, receiving, tracking), contacts (segments, topics, properties) and references", async () => {
    const orgId = new Types.ObjectId();
    const t = team();
    const conn = await newConnection(orgId, t.key);
    await run(conn.hex);
    const s = scope(orgId, conn.id);

    const d1 = await models.DomainModel.findOne({ ...s, name: `${t.name}.example.com` }).lean();
    expect(d1).toMatchObject({
      status: "verified",
      openTracking: false,
      clickTracking: true,
      receiving: { enabled: true, mxVerified: true },
      projectId: null,
    });
    expect(d1!.records.map((r) => r.record).sort()).toEqual(["DKIM", "Receiving", "SPF", "SPF"]);
    const d3 = await models.DomainModel.findOne({
      ...s,
      name: `news.${t.name}.example.com`,
    }).lean();
    expect(d3).toMatchObject({
      status: "pending",
      receiving: { enabled: false, mxVerified: false },
    });
    expect(d1!.syncedAt).toBeInstanceOf(Date);

    const segments = await models.SegmentModel.find(s).sort({ name: 1 }).lean();
    expect(Object.fromEntries(segments.map((x) => [x.name, x.contactCount]))).toEqual({
      "Beta testers": 2, // contacts 5 and 10
      Customers: 6,
      Newsletter: 12,
    });
    const newsletter = segments.find((x) => x.name === "Newsletter")!;
    const topic = await models.TopicModel.findOne({ ...s, name: "Product updates" }).lean();
    const four = await models.ContactModel.findOne({
      ...s,
      email: `person4@${t.name}-customers.example`,
    }).lean();
    expect(four).toMatchObject({ unsubscribed: false, properties: { company: "Company 0" } });
    expect(four!.segmentIds).toHaveLength(2);
    expect(four!.segmentIds.some((id) => id.equals(newsletter._id))).toBe(true);
    expect(four!.topicSubscriptions).toHaveLength(2);
    expect(four!.topicSubscriptions.some((x) => x.topicId.equals(topic!._id))).toBe(true);
    const six = await models.ContactModel.findOne({
      ...s,
      email: `person6@${t.name}-customers.example`,
    }).lean();
    expect(six!.properties).toEqual({ company: "Company 2", plan_seats: 6 });
    expect(topic).toMatchObject({ defaultSubscription: "opt_in", description: expect.any(String) });

    const sent = await models.BroadcastModel.findOne({ ...s, name: "September newsletter" }).lean();
    expect(sent).toMatchObject({ status: "sent", subject: expect.any(String) });
    expect(sent!.segmentId!.equals(newsletter._id)).toBe(true);
    expect(sent!.topicId!.equals(topic!._id)).toBe(true);
    const template = await models.TemplateModel.findOne({ ...s, name: "Welcome" }).lean();
    expect(template).toMatchObject({ status: "published", html: expect.stringContaining("<h1>") });
    expect(template!.variables).toEqual([{ key: "NAME", type: "string", fallback: "there" }]);
    const automation = await models.AutomationModel.findOne({
      ...s,
      name: "Welcome series",
    }).lean();
    expect(automation!.steps).toHaveLength(3);
    expect(automation!.connections).toHaveLength(2);
    // orgId comes from the run, never from Resend data.
    expect(sent!.orgId.equals(orgId)).toBe(true);
  });

  it("is idempotent: a second run upserts in place and keeps ids, extra fields and references", async () => {
    const orgId = new Types.ObjectId();
    const t = team();
    const conn = await newConnection(orgId, t.key);
    await run(conn.hex);
    const s = scope(orgId, conn.id);
    const before = await models.DomainModel.find(s).sort({ resendId: 1 }).lean();
    const project = new Types.ObjectId();
    await models.DomainModel.updateOne({ _id: before[0]!._id }, { projectId: project });

    await run(conn.hex);
    const after = await models.DomainModel.find(s).sort({ resendId: 1 }).lean();
    expect(after.map((d) => d._id.toHexString())).toEqual(before.map((d) => d._id.toHexString()));
    expect(after[0]!.projectId!.equals(project)).toBe(true); // sync never touches projectId
    expect(await models.ContactModel.countDocuments(s)).toBe(12);
    expect(await models.SyncRunModel.countDocuments({ connectionId: conn.id })).toBe(2);
    expect(after[0]!.syncedAt!.getTime()).toBeGreaterThan(before[0]!.syncedAt!.getTime());
  });

  it("pages large lists (230 contacts over 10 pages) and rebuilds segment membership", async () => {
    const orgId = new Types.ObjectId();
    const conn = await newConnection(orgId, team("manycontacts").key);
    await run(conn.hex);
    const s = scope(orgId, conn.id);
    expect(await models.ContactModel.countDocuments(s)).toBe(230);
    const newsletter = await models.SegmentModel.findOne({ ...s, name: "Newsletter" }).lean();
    expect(newsletter!.contactCount).toBe(230);
    expect(await models.ContactModel.countDocuments({ ...s, segmentIds: newsletter!._id })).toBe(
      230,
    );
  });

  it("replaces a contact re-created in Resend under a new id without tripping the email index", async () => {
    const orgId = new Types.ObjectId();
    const t = team();
    const conn = await newConnection(orgId, t.key);
    await run(conn.hex);
    const contacts = fake.fakeStore().teams.get(t.name)!.contacts;
    const first = contacts.find((c) => c.id.endsWith("_001"))!;
    first.id = `con_${t.name}_new`; // same address, new Resend id
    await run(conn.hex);
    const docs = await models.ContactModel.find({
      ...scope(orgId, conn.id),
      email: first.email,
    }).lean();
    expect(docs.map((d) => d.resendId)).toEqual([first.id]);
  });
});

describe("sync: removing what is gone in Resend", () => {
  it("removes mirrors missing remotely after a complete pass, and cleans references", async () => {
    const orgId = new Types.ObjectId();
    const t = team();
    const conn = await newConnection(orgId, t.key);
    await run(conn.hex);
    const s = scope(orgId, conn.id);
    const remote = fake.fakeStore().teams.get(t.name)!;

    // A key restricted to the domain that is about to disappear.
    const doomedDomain = await models.DomainModel.findOne({
      ...s,
      resendId: `dom_${t.name}_3`,
    }).lean();
    await models.ApiKeyModel.updateOne(
      { ...s, resendId: `key_${t.name}_2` },
      { domainId: doomedDomain!._id },
    );

    remote.domains = remote.domains.filter((d) => d.id !== `dom_${t.name}_3`);
    remote.segments = remote.segments.filter((x) => x.id !== `seg_${t.name}_2`);
    remote.topics = remote.topics.filter((x) => x.id !== `top_${t.name}_2`);
    remote.templates = remote.templates.filter((x) => x.id !== `tpl_${t.name}_3`);
    remote.contacts = remote.contacts.slice(3);
    remote.broadcasts = remote.broadcasts.filter((x) => x.id !== `bro_${t.name}_1`);
    remote.automations = remote.automations.filter((x) => x.id !== `aut_${t.name}_2`);
    remote.contactProperties = remote.contactProperties.filter((x) => x.id !== `prop_${t.name}_2`);
    remote.apiKeys = remote.apiKeys.filter((x) => x.id !== `key_${t.name}_1`);

    await run(conn.hex);
    expect(await models.DomainModel.countDocuments(s)).toBe(2);
    expect(await models.SegmentModel.countDocuments(s)).toBe(2);
    expect(await models.TopicModel.countDocuments(s)).toBe(1);
    expect(await models.TemplateModel.countDocuments(s)).toBe(2);
    expect(await models.ContactModel.countDocuments(s)).toBe(9);
    expect(await models.BroadcastModel.countDocuments(s)).toBe(1);
    expect(await models.AutomationModel.countDocuments(s)).toBe(1);
    expect(await models.ContactPropertyModel.countDocuments(s)).toBe(1);
    expect(await models.ApiKeyModel.countDocuments(s)).toBe(2);

    const key = await models.ApiKeyModel.findOne({ ...s, resendId: `key_${t.name}_2` }).lean();
    expect(key!.domainId).toBeNull();
    const segmentIds = new Set(
      (await models.SegmentModel.find(s).lean()).map((x) => x._id.toHexString()),
    );
    const topicIds = new Set(
      (await models.TopicModel.find(s).lean()).map((x) => x._id.toHexString()),
    );
    for (const c of await models.ContactModel.find(s).lean()) {
      expect(c.segmentIds.every((id) => segmentIds.has(id.toHexString()))).toBe(true);
      expect(c.topicSubscriptions.every((x) => topicIds.has(x.topicId.toHexString()))).toBe(true);
    }
    const remaining = await models.BroadcastModel.findOne(s).lean();
    expect(remaining!.name).toBe("October draft");
    expect(remaining!.segmentId).toBeNull(); // its segment (Customers) was removed
    const last = await latestRun(conn.id);
    expect(last!.resources.find((r) => r.name === "contacts")!.removed).toBe(3);
  });

  it("never removes anything when a stage did not finish, and removes once a retry completes it", async () => {
    const orgId = new Types.ObjectId();
    const t = team("manycontacts");
    const conn = await newConnection(orgId, t.key);
    const s = scope(orgId, conn.id);
    const stale = await models.ContactModel.create({
      ...s,
      resendId: "gone-in-resend",
      email: "ghost@example.com",
      syncedAt: new Date(Date.now() - 86_400_000),
    });

    // Fail the third contacts page with a permanent (non-retryable) Resend error.
    const forbidden = await resendError("resend_forbidden");
    const failing = spied(t.key, {
      fail: (method, args, count) =>
        method === "listContacts" && !(args[0] as { segmentId?: string })?.segmentId && count === 3
          ? forbidden
          : undefined,
    });
    const started = (await sync.startOrResumeRun({ connectionId: conn.hex, trigger: "manual" }))!;
    let outcome: Awaited<ReturnType<typeof sync.syncNextPage>>;
    do {
      outcome = await sync.syncNextPage(started.runId, { adapter: failing.adapter });
    } while (outcome.status === "progress");

    expect(outcome).toMatchObject({ status: "failed" });
    expect(await models.ContactModel.exists({ _id: stale._id })).toBeTruthy(); // partial pass: kept
    const failed = await latestRun(conn.id);
    expect(failed).toMatchObject({
      status: "failed",
      stage: "contacts",
      error: expect.any(String),
    });
    const contacts = failed!.resources.find((r) => r.name === "contacts")!;
    expect(contacts).toMatchObject({ status: "failed" });
    expect(contacts.cursor).toBeTruthy();
    expect(contacts.count).toBe(50);

    // Retry: the same run continues from the failed stage; finished stages are not redone.
    const retry = spied(t.key);
    const resumed = (await sync.startOrResumeRun({ connectionId: conn.hex, trigger: "manual" }))!;
    expect(resumed).toEqual({ runId: started.runId, resumed: true });
    do {
      outcome = await sync.syncNextPage(resumed.runId, { adapter: retry.adapter });
    } while (outcome.status === "progress");
    expect(outcome).toEqual({ status: "done" });
    expect(retry.of("listDomains")).toHaveLength(0);
    expect(retry.of("listSegments")).toHaveLength(0);
    expect(await models.ContactModel.exists({ _id: stale._id })).toBeNull(); // complete pass: removed
    expect(await models.ContactModel.countDocuments(s)).toBe(230);
  });
});

describe("sync: checkpoints and resume", () => {
  it("resumes a crashed run at the saved cursor without repeating finished work", async () => {
    const orgId = new Types.ObjectId();
    const t = team("manycontacts");
    const conn = await newConnection(orgId, t.key);
    const s = scope(orgId, conn.id);

    const started = (await sync.startOrResumeRun({ connectionId: conn.hex, trigger: "initial" }))!;
    expect(started.resumed).toBe(false);
    const first = spied(t.key);
    // Drive pages until we are a few pages into the contacts stage, then "crash".
    for (let i = 0; i < 60; i++) {
      await sync.syncNextPage(started.runId, { adapter: first.adapter });
      const r = await models.SyncRunModel.findById(started.runId).lean();
      const contacts = r!.resources.find((x) => x.name === "contacts")!;
      if (contacts.status === "running" && contacts.count >= 75) break;
    }
    const mid = await models.SyncRunModel.findById(started.runId).lean();
    const checkpoint = mid!.resources.find((x) => x.name === "contacts")!;
    expect(checkpoint.cursor).toBeTruthy();
    expect(mid!.resources.find((x) => x.name === "domains")!.status).toBe("completed");
    expect(mid!.resources.find((x) => x.name === "broadcasts")!.status).toBe("pending");
    expect(await models.ContactModel.countDocuments(s)).toBe(checkpoint.count);

    // A new invocation picks up the same run.
    const second = spied(t.key);
    const resumed = (await sync.startOrResumeRun({ connectionId: conn.hex, trigger: "initial" }))!;
    expect(resumed).toEqual({ runId: started.runId, resumed: true });
    let outcome;
    do {
      outcome = await sync.syncNextPage(resumed.runId, { adapter: second.adapter });
    } while (outcome.status === "progress");
    expect(outcome).toEqual({ status: "done" });

    expect(second.of("listDomains")).toHaveLength(0);
    expect(second.of("listTemplates")).toHaveLength(0);
    const firstContactsCall = second.of("listContacts")[0]!;
    expect(firstContactsCall.args[0]).toMatchObject({ after: checkpoint.cursor });
    expect(await models.ContactModel.countDocuments(s)).toBe(230);
    expect(await models.SyncRunModel.countDocuments({ connectionId: conn.id })).toBe(1);
    const final = await latestRun(conn.id);
    expect(final!.resources.find((x) => x.name === "contacts")!.count).toBe(230); // no double counting
  });

  it("starts a fresh run after a completed one, and after a failed one that is too old", async () => {
    const orgId = new Types.ObjectId();
    const conn = await newConnection(orgId, team().key);
    await run(conn.hex);
    const next = (await sync.startOrResumeRun({ connectionId: conn.hex, trigger: "manual" }))!;
    expect(next.resumed).toBe(false);
    await sync.failSyncRun(next.runId, "boom");
    await models.SyncRunModel.updateOne(
      { _id: next.runId },
      { $set: { updatedAt: new Date(Date.now() - 2 * 3600_000) } },
      { timestamps: false },
    );
    const again = (await sync.startOrResumeRun({ connectionId: conn.hex, trigger: "manual" }))!;
    expect(again.resumed).toBe(false);
    expect(again.runId).not.toBe(next.runId);
  });

  it("does not start for missing, removed or disabled connections", async () => {
    const orgId = new Types.ObjectId();
    expect(await sync.startOrResumeRun({ connectionId: "junk", trigger: "manual" })).toBeNull();
    expect(
      await sync.startOrResumeRun({
        connectionId: new Types.ObjectId().toHexString(),
        trigger: "manual",
      }),
    ).toBeNull();
    const removed = await newConnection(orgId, team().key);
    await models.ConnectionModel.updateOne({ _id: removed.id }, { deletedAt: new Date() });
    expect(
      await sync.startOrResumeRun({ connectionId: removed.hex, trigger: "manual" }),
    ).toBeNull();
    const disabled = await newConnection(orgId, team().key, { status: "disabled" });
    expect(
      await sync.startOrResumeRun({ connectionId: disabled.hex, trigger: "manual" }),
    ).toBeNull();
  });
});

describe("sync: Resend errors", () => {
  it("a 429 saves nothing, reports retry-after, and the same call succeeds afterwards", async () => {
    const orgId = new Types.ObjectId();
    const t = team("ratelimitsync");
    const conn = await newConnection(orgId, t.key);
    const started = (await sync.startOrResumeRun({ connectionId: conn.hex, trigger: "manual" }))!;
    const outcomes: Awaited<ReturnType<typeof sync.syncNextPage>>[] = [];
    let last;
    do {
      last = await sync.syncNextPage(started.runId);
      outcomes.push(last);
    } while (last.status !== "done");

    const limited = outcomes.filter((o) => o.status === "rate_limited");
    expect(limited).toEqual([{ status: "rate_limited", retryAfterSeconds: 1 }]);
    const at = outcomes.findIndex((o) => o.status === "rate_limited");
    expect(outcomes[at - 1]).toMatchObject({ status: "progress", stage: "contact_properties" });
    expect(outcomes[at + 1]).toMatchObject({ status: "progress", stage: "templates" });
    const final = await latestRun(conn.id);
    expect(final).toMatchObject({ status: "completed" });
    expect(final!.resources.find((r) => r.name === "templates")).toMatchObject({ count: 3 });
    expect(await models.TemplateModel.countDocuments(scope(orgId, conn.id))).toBe(3);
  });

  it("the inline runner backs off and finishes through a 429", async () => {
    const orgId = new Types.ObjectId();
    const conn = await newConnection(orgId, team("ratelimitsync").key);
    expect(await run(conn.hex)).toEqual({ status: "done" });
  });

  it("a revoked key fails the run with a plain message and flags the connection", async () => {
    const orgId = new Types.ObjectId();
    const t = team();
    const conn = await newConnection(orgId, t.key);
    const unauthorized = await resendError("resend_unauthorized");
    const bad = spied(t.key, { fail: (m) => (m === "listApiKeys" ? unauthorized : undefined) });
    const started = (await sync.startOrResumeRun({ connectionId: conn.hex, trigger: "manual" }))!;
    let outcome;
    do {
      outcome = await sync.syncNextPage(started.runId, { adapter: bad.adapter });
    } while (outcome.status === "progress");
    expect(outcome).toMatchObject({ status: "failed", error: expect.stringContaining("API key") });
    const doc = await models.ConnectionModel.findById(conn.id).lean();
    expect(doc).toMatchObject({ status: "needs_attention", statusReason: "key_revoked" });
    expect(await latestRun(conn.id)).toMatchObject({ status: "failed", stage: "api_keys" });
    expect(JSON.stringify(await latestRun(conn.id))).not.toContain(t.key);
  });

  it("unexpected errors are thrown for the job's retry policy, and failRunningSync marks the run", async () => {
    const orgId = new Types.ObjectId();
    const t = team();
    const conn = await newConnection(orgId, t.key);
    const unknown = await resendError("resend_unknown");
    const flaky = spied(t.key, { fail: (m) => (m === "listDomains" ? unknown : undefined) });
    const started = (await sync.startOrResumeRun({ connectionId: conn.hex, trigger: "manual" }))!;
    await expect(
      sync.syncNextPage(started.runId, { adapter: flaky.adapter }),
    ).rejects.toMatchObject({
      code: "resend_unknown",
    });
    expect(await latestRun(conn.id)).toMatchObject({ status: "running" }); // still resumable
    await sync.failRunningSync(conn.hex, "Something went wrong");
    expect(await latestRun(conn.id)).toMatchObject({
      status: "failed",
      error: "Something went wrong",
    });
  });
});

describe("sync: realtime and checklist", () => {
  it("publishes realtime events for the resources and the connection", async () => {
    const orgId = new Types.ObjectId();
    const conn = await newConnection(orgId, team().key);
    await run(conn.hex);
    const events = await models.RealtimeEventModel.find({ orgId }).lean();
    const topics = new Set(events.flatMap((e) => e.topics));
    for (const topic of [
      "domains",
      "contacts",
      "templates",
      "broadcasts",
      "automations",
      "connections",
      `connection:${conn.hex}`,
    ]) {
      expect(topics.has(topic), topic).toBe(true);
    }
  });

  it("stores the checklist after a sync: a mix of ok and warn for the seeded account", async () => {
    const orgId = new Types.ObjectId();
    const conn = await newConnection(orgId, team().key);
    await run(conn.hex);
    const doc = await models.ConnectionModel.findById(conn.id).lean();
    const status = Object.fromEntries(doc!.checklist!.map((i) => [i.key, i.status]));
    expect(status).toEqual({
      webhook: "warn", // registered, but no event has arrived
      domain_verified: "warn",
      dns_records: "warn",
      open_tracking: "warn",
      click_tracking: "ok",
      receiving: "warn",
    });
    expect(doc!.checklist!.length).toBeLessThanOrEqual(10);
    expect(doc!.checklist!.every((i) => i.checkedAt instanceof Date)).toBe(true);
  });

  it("webhook item: ok with events, fail when Resend has lost the webhook or none is registered", async () => {
    const orgId = new Types.ObjectId();
    const healthy = await newConnection(orgId, team().key, { lastEventAt: new Date() });
    await run(healthy.hex);
    const webhookStatus = async (id: Types.ObjectId) =>
      (await models.ConnectionModel.findById(id).lean())!.checklist!.find(
        (i) => i.key === "webhook",
      )!.status;
    expect(await webhookStatus(healthy.id)).toBe("ok");

    const t = team();
    const lost = await newConnection(orgId, t.key, { lastEventAt: new Date() });
    fake.fakeStore().teams.get(t.name)!.webhooks.clear(); // e.g. someone deleted it in Resend
    await run(lost.hex);
    expect(await webhookStatus(lost.id)).toBe("fail");

    const none = await newConnection(orgId, team().key, { webhook: false });
    await run(none.hex);
    expect(await webhookStatus(none.id)).toBe("fail");
  });

  it("an account without domains fails the verified-domain item and omits the rest", async () => {
    const orgId = new Types.ObjectId();
    const conn = await newConnection(orgId, team("nodomains").key);
    await run(conn.hex);
    const doc = await models.ConnectionModel.findById(conn.id).lean();
    expect(doc!.checklist!.map((i) => [i.key, i.status])).toEqual([
      ["webhook", "warn"],
      ["domain_verified", "fail"],
    ]);
  });

  it("a fully configured account is all green", async () => {
    const orgId = new Types.ObjectId();
    const conn = await newConnection(orgId, team("allgood").key, { lastEventAt: new Date() });
    await run(conn.hex);
    const doc = await models.ConnectionModel.findById(conn.id).lean();
    expect(doc!.checklist!.every((i) => i.status === "ok")).toBe(true);
  });
});

describe("one-click fixes", () => {
  it("turns on read receipts everywhere they are off, in Resend and in the mirror, and recomputes", async () => {
    const orgId = new Types.ObjectId();
    const t = team();
    const conn = await newConnection(orgId, t.key);
    await run(conn.hex);
    const ctx = ctxFor(orgId, "admin");

    const result = await fixes.enableTracking(ctx, { connectionId: conn.hex, kind: "open" });
    expect(result.updated).toEqual([`${t.name}.example.com`]);
    expect(result.missing).toEqual([]);
    expect(result.checklist.find((i) => i.key === "open_tracking")).toMatchObject({
      status: "ok",
      fix: null,
    });

    expect(
      fake
        .fakeStore()
        .teams.get(t.name)!
        .domains.every((d) => d.openTracking),
    ).toBe(true);
    const doc = await models.DomainModel.findOne({
      ...scope(orgId, conn.id),
      name: `${t.name}.example.com`,
    }).lean();
    expect(doc!.openTracking).toBe(true);
    const stored = await models.ConnectionModel.findById(conn.id).lean();
    expect(stored!.checklist!.find((i) => i.key === "open_tracking")!.status).toBe("ok");
    expect(stored!.checklist!.find((i) => i.key === "receiving")!.status).toBe("warn"); // untouched

    const audit = await models.AuditLogModel.findOne({
      orgId,
      action: "domain.tracking_updated",
    }).lean();
    expect(audit!.changes!.after).toMatchObject({ openTracking: true });
    // A second press has nothing left to change.
    expect(await fixes.enableTracking(ctx, { connectionId: conn.hex, kind: "open" })).toMatchObject(
      {
        updated: [],
      },
    );
  });

  it("click tracking works the same way, and a domain Resend no longer knows is reported", async () => {
    const orgId = new Types.ObjectId();
    const t = team();
    const conn = await newConnection(orgId, t.key);
    await run(conn.hex);
    const remote = fake.fakeStore().teams.get(t.name)!;
    remote.domains.find((d) => d.id === `dom_${t.name}_2`)!.clickTracking = false;
    await models.DomainModel.updateOne(
      { ...scope(orgId, conn.id), resendId: `dom_${t.name}_2` },
      { clickTracking: false },
    );
    remote.domains = remote.domains.filter((d) => d.id !== `dom_${t.name}_3`);
    await models.DomainModel.updateOne(
      { ...scope(orgId, conn.id), resendId: `dom_${t.name}_3` },
      { clickTracking: false }, // stale mirror of a domain deleted in Resend
    );
    const result = await fixes.enableTracking(ctxFor(orgId, "developer"), {
      connectionId: conn.hex,
      kind: "click",
    });
    expect(result.updated).toEqual([`mail.${t.name}.example.com`]);
    expect(result.missing).toEqual([`news.${t.name}.example.com`]);
  });

  it("checks permissions: viewer and support cannot change tracking; developer cannot touch the webhook or sync", async () => {
    const orgId = new Types.ObjectId();
    const conn = await newConnection(orgId, team().key);
    await run(conn.hex);
    for (const role of ["viewer", "support"] as const) {
      await expect(
        fixes.enableTracking(ctxFor(orgId, role), { connectionId: conn.hex, kind: "open" }),
      ).rejects.toMatchObject({ code: "forbidden" });
    }
    const developer = ctxFor(orgId, "developer");
    await expect(
      fixes.reregisterWebhook(developer, { connectionId: conn.hex }),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(sync.syncNow(developer, { connectionId: conn.hex })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      fixes.reregisterWebhook(ctxFor(orgId, "viewer"), { connectionId: conn.hex }),
    ).rejects.toMatchObject({ code: "forbidden" });
    // Nothing changed in Resend or the mirror.
    expect(
      await models.AuditLogModel.countDocuments({ orgId, action: /tracking|sync_requested/ }),
    ).toBe(0);
    const domains = await models.DomainModel.find(scope(orgId, conn.id)).lean();
    expect(domains.filter((d) => !d.openTracking)).toHaveLength(1);
  });

  it("refuses read-only connections and maps Resend refusals to plain errors", async () => {
    const orgId = new Types.ObjectId();
    const ro = await newConnection(orgId, team().key, { status: "read_only" });
    await run(ro.hex);
    await expect(
      fixes.enableTracking(ctxFor(orgId), { connectionId: ro.hex, kind: "open" }),
    ).rejects.toMatchObject({ code: "conflict" });

    const t = team();
    const conn = await newConnection(orgId, t.key);
    await run(conn.hex);
    const forbidden = await resendError("resend_forbidden");
    const refusing = spied(t.key, { fail: (m) => (m === "updateDomain" ? forbidden : undefined) });
    await expect(
      fixes.enableTracking(
        ctxFor(orgId),
        { connectionId: conn.hex, kind: "open" },
        { adapter: refusing.adapter },
      ),
    ).rejects.toMatchObject({ code: "resend_forbidden" });
    expect(
      (await models.DomainModel.find(scope(orgId, conn.id)).lean()).filter((d) => !d.openTracking),
    ).toHaveLength(1);
  });

  it("re-registers a webhook Resend has lost, storing the new signing secret", async () => {
    const orgId = new Types.ObjectId();
    const t = team();
    const conn = await newConnection(orgId, t.key, { lastEventAt: new Date() });
    const remote = fake.fakeStore().teams.get(t.name)!;
    const oldId = (await models.ConnectionModel.findById(conn.id).lean())!.webhook!.resendId;
    remote.webhooks.clear();
    await run(conn.hex);
    const before = (await models.ConnectionModel.findById(conn.id).lean())!;
    expect(before.checklist!.find((i) => i.key === "webhook")!.status).toBe("fail");

    const result = await fixes.reregisterWebhook(ctxFor(orgId, "admin"), {
      connectionId: conn.hex,
    });
    expect(result).toMatchObject({ registered: true, status: "active" });
    expect(result.checklist.find((i) => i.key === "webhook")).toMatchObject({
      status: "ok",
      fix: null,
    });
    const after = (await models.ConnectionModel.findById(conn.id).lean())!;
    expect(after.webhook!.resendId).not.toBe(oldId);
    expect(remote.webhooks.size).toBe(1);
    const [created] = [...remote.webhooks.values()];
    expect(created!.endpoint).toContain(conn.hex);
    expect(await hook.readWebhookSigningSecret(conn.hex)).toBe(created!.signingSecret);
    expect(after.checklist!.find((i) => i.key === "webhook")!.status).toBe("ok");
  });

  it("when the account has no free slot the old webhook is forgotten and the connection needs attention", async () => {
    const orgId = new Types.ObjectId();
    const t = team("slotfull");
    const conn = await newConnection(orgId, t.key, { webhook: false, lastEventAt: new Date() });
    // A webhook we believe we have (Resend never confirmed it in this fake).
    await models.ConnectionModel.updateOne(
      { _id: conn.id },
      {
        webhook: {
          resendId: "wh_old",
          signingSecret: envelope.encryptSecret("whsec_old", { aad: hook.secretAad(conn.id) }),
          events: ["email.sent"],
          registeredAt: new Date(),
        },
      },
    );
    const result = await fixes.reregisterWebhook(ctxFor(orgId), { connectionId: conn.hex });
    expect(result).toMatchObject({ registered: false, status: "needs_attention" });
    const doc = (await models.ConnectionModel.findById(conn.id).lean())!;
    expect(doc.webhook).toBeUndefined();
    expect(doc.statusReason).toBe("webhook_slot_unavailable");
    expect(doc.checklist!.find((i) => i.key === "webhook")!.status).toBe("fail");
  });
});

describe("syncNow and requesting syncs", () => {
  it("creates the run, enqueues one job and refuses a second while one is running", async () => {
    const orgId = new Types.ObjectId();
    const conn = await newConnection(orgId, team().key);
    const ctx = ctxFor(orgId, "admin");
    expect(await sync.syncNow(ctx, { connectionId: conn.hex })).toEqual({ mode: "queued" });
    expect(jobs.sentJobs).toEqual([
      {
        name: "connection/sync.requested",
        data: { connectionId: conn.hex, orgId: orgId.toHexString(), trigger: "manual" },
      },
    ]);
    expect(await latestRun(conn.id)).toMatchObject({ status: "running", trigger: "manual" });
    expect(await sync.syncNow(ctx, { connectionId: conn.hex })).toEqual({
      mode: "already_running",
    });
    expect(jobs.sentJobs).toHaveLength(1);
    expect(
      await models.AuditLogModel.countDocuments({ orgId, action: "connection.sync_requested" }),
    ).toBe(1);

    // A run that stopped writing (dead worker) is picked up again rather than blocking forever.
    await models.SyncRunModel.updateOne(
      { connectionId: conn.id },
      { $set: { updatedAt: new Date(Date.now() - 10 * 60_000) } },
      { timestamps: false },
    );
    expect(await sync.syncNow(ctx, { connectionId: conn.hex })).toEqual({ mode: "queued" });
    expect(await models.SyncRunModel.countDocuments({ connectionId: conn.id })).toBe(1);
  });

  it("is scoped to the organization and to live, enabled connections", async () => {
    const orgA = new Types.ObjectId();
    const orgB = new Types.ObjectId();
    const conn = await newConnection(orgA, team().key);
    await expect(sync.syncNow(ctxFor(orgB), { connectionId: conn.hex })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await models.SyncRunModel.countDocuments({ connectionId: conn.id })).toBe(0);
    const disabled = await newConnection(orgA, team().key, { status: "disabled" });
    await expect(sync.syncNow(ctxFor(orgA), { connectionId: disabled.hex })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("runs inline only where explicitly allowed and no job server took the job", async () => {
    expect(
      sync.shouldRunInline({ delivered: false, inngestDev: true, nodeEnv: "development" }),
    ).toBe(true);
    expect(
      sync.shouldRunInline({ delivered: true, inngestDev: true, nodeEnv: "development" }),
    ).toBe(false);
    expect(
      sync.shouldRunInline({ delivered: false, inngestDev: false, nodeEnv: "development" }),
    ).toBe(false);
    expect(
      sync.shouldRunInline({ delivered: false, inngestDev: true, nodeEnv: "production" }),
    ).toBe(false);

    const orgId = new Types.ObjectId();
    const input = (conn: { hex: string }) => ({
      connectionId: conn.hex,
      orgId: orgId.toHexString(),
      trigger: "manual" as const,
    });

    // No Inngest server (job dropped) + INNGEST_DEV: the sync runs in this process.
    const a = await newConnection(orgId, team().key);
    const inline = await sync.requestSync(input(a), {
      enqueue: async () => false,
      inngestDev: true,
      nodeEnv: "development",
    });
    expect(inline.mode).toBe("inline");
    await inline.done;
    expect(await latestRun(a.id)).toMatchObject({ status: "completed" });
    expect((await models.ConnectionModel.findById(a.id).lean())!.lastSyncAt).toBeInstanceOf(Date);

    // Job delivered: nothing runs here, the run waits for the Inngest function.
    const b = await newConnection(orgId, team().key);
    const queued = await sync.requestSync(input(b), {
      enqueue: async () => true,
      inngestDev: true,
      nodeEnv: "development",
    });
    expect(queued).toEqual({ mode: "queued" });
    expect(await latestRun(b.id)).toMatchObject({ status: "running" });
    expect(await models.DomainModel.countDocuments(scope(orgId, b.id))).toBe(0);

    // INNGEST_DEV off (production-like): dropped jobs are not run inline.
    const c = await newConnection(orgId, team().key);
    expect(
      await sync.requestSync(input(c), {
        enqueue: async () => false,
        inngestDev: false,
        nodeEnv: "production",
      }),
    ).toEqual({ mode: "queued" });
    expect(await models.DomainModel.countDocuments(scope(orgId, c.id))).toBe(0);
  });

  it("the inline runner does not start two runs for one connection", async () => {
    const orgId = new Types.ObjectId();
    const conn = await newConnection(orgId, team().key);
    const [x, y] = await Promise.all([run(conn.hex), run(conn.hex)]);
    expect(x).toEqual({ status: "done" });
    expect(y).toEqual({ status: "done" });
    expect(await models.SyncRunModel.countDocuments({ connectionId: conn.id })).toBe(1);
  });
});

describe("sync-connection function", () => {
  function tools() {
    const steps: string[] = [];
    const sleeps: [string, string][] = [];
    const sent: unknown[] = [];
    return {
      steps,
      sleeps,
      sent,
      step: {
        run: async (id: string, f: () => Promise<unknown>) => {
          steps.push(id);
          return JSON.parse(JSON.stringify((await f()) ?? null)); // like Inngest: results are JSON
        },
        sleep: async (id: string, time: string) => void sleeps.push([id, time]),
        sendEvent: async (id: string, payload: unknown) => {
          steps.push(id);
          sent.push(payload);
        },
      },
    };
  }

  it("runs one durable step per page and finishes the run", async () => {
    const orgId = new Types.ObjectId();
    const conn = await newConnection(orgId, team().key);
    const t = tools();
    const result = await fn.runSyncLoop(t.step, {
      connectionId: conn.hex,
      orgId: orgId.toHexString(),
      trigger: "initial",
    });
    expect(result).toEqual({ status: "done" });
    expect(t.steps[0]).toBe("start");
    expect(new Set(t.steps).size).toBe(t.steps.length); // unique step ids
    expect(t.steps.filter((s) => s.startsWith("page-")).length).toBeGreaterThanOrEqual(
      sync.SYNC_STAGE_ORDER.length,
    );
    expect(await latestRun(conn.id)).toMatchObject({ status: "completed", trigger: "initial" });
  });

  it("sleeps for retry-after on a 429 instead of failing", async () => {
    const orgId = new Types.ObjectId();
    const conn = await newConnection(orgId, team("ratelimitsync").key);
    const t = tools();
    const result = await fn.runSyncLoop(t.step, {
      connectionId: conn.hex,
      orgId: orgId.toHexString(),
      trigger: "manual",
    });
    expect(result).toEqual({ status: "done" });
    expect(t.sleeps).toHaveLength(1);
    expect(t.sleeps[0]![1]).toBe("1s");
  });

  it("hands over to a new invocation before the step budget runs out, and that one resumes", async () => {
    const orgId = new Types.ObjectId();
    const conn = await newConnection(orgId, team().key);
    const data = {
      connectionId: conn.hex,
      orgId: orgId.toHexString(),
      trigger: "initial" as const,
    };
    const first = tools();
    expect(await fn.runSyncLoop(first.step, data, 3)).toEqual({ status: "continued" });
    expect(first.sent).toEqual([{ name: "connection/sync.requested", data }]);
    const mid = await latestRun(conn.id);
    expect(mid!.status).toBe("running");
    expect(mid!.resources.filter((r) => r.status === "completed").length).toBe(3);

    const second = tools();
    expect(await fn.runSyncLoop(second.step, data)).toEqual({ status: "done" });
    expect(await models.SyncRunModel.countDocuments({ connectionId: conn.id })).toBe(1);
  });

  it("skips connections that are gone", async () => {
    const t = tools();
    const result = await fn.runSyncLoop(t.step, {
      connectionId: new Types.ObjectId().toHexString(),
      orgId: new Types.ObjectId().toHexString(),
      trigger: "manual",
    });
    expect(result).toEqual({ status: "skipped" });
  });
});

describe("tenant isolation", () => {
  it("keeps two organizations' mirrors apart, even for the same Resend account", async () => {
    const orgA = new Types.ObjectId();
    const orgB = new Types.ObjectId();
    const t = team();
    const a = await newConnection(orgA, t.key);
    const b = await newConnection(orgB, t.key); // an agency and its client may share one account
    await Promise.all([run(a.hex), run(b.hex)]);

    for (const [org, conn] of [
      [orgA, a],
      [orgB, b],
    ] as const) {
      const docs = await models.ContactModel.find(scope(org, conn.id)).lean();
      expect(docs).toHaveLength(12);
      expect(docs.every((d) => d.orgId.equals(org))).toBe(true);
    }
    expect(await models.ContactModel.countDocuments({ orgId: orgA })).toBe(12);
    expect(await models.ContactModel.countDocuments({ connectionId: b.id, orgId: orgA })).toBe(0);
    // Same Resend ids, different documents.
    const one = await models.DomainModel.findOne({
      orgId: orgA,
      resendId: `dom_${t.name}_1`,
    }).lean();
    const two = await models.DomainModel.findOne({
      orgId: orgB,
      resendId: `dom_${t.name}_1`,
    }).lean();
    expect(one!._id.equals(two!._id)).toBe(false);

    // Removals in one tenant leave the other alone.
    fake.fakeStore().teams.get(t.name)!.templates = [];
    await run(a.hex);
    expect(await models.TemplateModel.countDocuments(scope(orgA, a.id))).toBe(0);
    expect(await models.TemplateModel.countDocuments(scope(orgB, b.id))).toBe(3);
  });

  it("reads, counts and fixes are scoped to the caller's organization", async () => {
    const orgA = new Types.ObjectId();
    const orgB = new Types.ObjectId();
    const conn = await newConnection(orgA, team().key);
    await run(conn.hex);

    expect((await detail.getConnectionDetail(ctxFor(orgA), conn.hex)).counts).toMatchObject({
      domains: 3,
      contacts: 12,
      broadcasts: 2,
    });
    expect(await detail.countMirrors(orgB, conn.id)).toEqual({
      domains: 0,
      apiKeys: 0,
      segments: 0,
      topics: 0,
      contactProperties: 0,
      templates: 0,
      contacts: 0,
      broadcasts: 0,
      automations: 0,
    });
    await expect(detail.getConnectionDetail(ctxFor(orgB), conn.hex)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(detail.getConnectionDetail(ctxFor(orgA), "junk")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      fixes.enableTracking(ctxFor(orgB), { connectionId: conn.hex, kind: "open" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      fixes.reregisterWebhook(ctxFor(orgB), { connectionId: conn.hex }),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    // Sync status too: another org sees no runs for this connection.
    const foreign = await sync.getLatestSyncStatuses(orgB, [conn.id]);
    expect(foreign.size).toBe(0);
    expect((await sync.getLatestSyncStatuses(orgA, [conn.id])).get(conn.hex)).toMatchObject({
      state: "completed",
      stage: null,
    });
  });

  it("the connection page needs connection:read, which every role has", async () => {
    const orgId = new Types.ObjectId();
    const conn = await newConnection(orgId, team().key);
    await run(conn.hex);
    for (const role of ["owner", "admin", "developer", "support", "viewer"] as const) {
      const dto = await detail.getConnectionDetail(ctxFor(orgId, role), conn.hex);
      expect(dto.checklist.length).toBeGreaterThan(0);
      // The DTO never carries key material.
      expect(JSON.stringify(dto)).not.toMatch(/ciphertext|wrappedDek|whsec_|re_t\d+_full/);
    }
    const dto = await detail.getConnectionDetail(ctxFor(orgId), conn.hex);
    expect(dto.checklist.find((i) => i.key === "open_tracking")).toMatchObject({
      status: "warn",
      domains: [expect.stringMatching(/\.example\.com$/)],
      fix: { kind: "enable_open_tracking" },
    });
    expect(dto.domains).toHaveLength(3);
    expect(dto.sync).toMatchObject({ state: "completed" });
  });
});
