/**
 * Performance check for TRD §6. Seeds realistic volumes into a dedicated database, measures p95 of
 * the hot paths through the real service functions / route handler, and reads MongoDB's profiler
 * to confirm every query used an index (no COLLSCAN) and to spot in-memory sorts.
 *
 *   pnpm perf                     # 50k emails, 5k threads, 100k events (+ noise orgs), reuses a seed
 *   pnpm perf --reseed            # drop and seed again
 *   pnpm perf --emails 10000 --threads 1000 --events 20000 --iterations 100
 *
 * Database: PERF_MONGODB_URI (default mongodb://127.0.0.1:27017/wisemail_perf?replicaSet=rs0).
 * Refuses any database whose name does not contain "perf". Runs with NODE_ENV=test, so job
 * enqueueing is recorded in memory (a real Inngest send is a network call on top of the ingest
 * figure; see docs/PLAN.md).
 */
import Module from "node:module";
import { parseArgs } from "node:util";

// `server-only` throws outside a React Server build; services import it, so make it a no-op here
// (Vitest does the same through an alias).
const moduleInternals = Module as unknown as {
  _load: (request: string, ...rest: unknown[]) => unknown;
};
const originalLoad = moduleInternals._load;
moduleInternals._load = function (request: string, ...rest: unknown[]) {
  return request === "server-only" ? {} : originalLoad.call(this, request, ...rest);
};

const { values: args } = parseArgs({
  options: {
    reseed: { type: "boolean", default: false },
    emails: { type: "string", default: "50000" },
    threads: { type: "string", default: "5000" },
    events: { type: "string", default: "100000" },
    "noise-orgs": { type: "string", default: "5" },
    iterations: { type: "string", default: "200" },
    json: { type: "boolean", default: false },
  },
});

const uri =
  process.env.PERF_MONGODB_URI ?? "mongodb://127.0.0.1:27017/wisemail_perf?replicaSet=rs0";
const dbName = new URL(uri.replace(/^mongodb(\+srv)?:/, "http:")).pathname.slice(1);
if (!/perf/i.test(dbName)) {
  console.error(`[perf] Refusing to use database "${dbName}": the name must contain "perf".`);
  process.exit(1);
}

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = uri;
process.env.BETTER_AUTH_SECRET ??= "perf-secret-perf-secret-perf-secret-0000";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.APP_URL ??= "http://localhost:3000";
process.env.ENCRYPTION_KEK_CURRENT ??= Buffer.alloc(32, 5).toString("base64");
process.env.ENCRYPTION_KEK_ID ??= "perf-1";

const N_EMAILS = Number(args.emails);
const N_THREADS = Number(args.threads);
const N_EVENTS = Number(args.events);
const NOISE_ORGS = Number(args["noise-orgs"]);
const ITERATIONS = Number(args.iterations);

type Doc = Record<string, unknown>;

/* ----------------------------------------------------------------------------------------- */
/* Deterministic randomness, so runs are comparable                                             */
/* ----------------------------------------------------------------------------------------- */

let seedState = 0x2f6e2b1;
const rand = () => {
  seedState = (seedState * 1664525 + 1013904223) >>> 0;
  return seedState / 0x100000000;
};
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const weighted = <T>(items: readonly (readonly [T, number])[]): T => {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let r = rand() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[0]![0];
};

/* ----------------------------------------------------------------------------------------- */
/* Statistics                                                                                   */
/* ----------------------------------------------------------------------------------------- */

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;

type Stat = { name: string; n: number; p50: number; p95: number; p99: number; max: number };

async function measure(
  name: string,
  run: (i: number) => Promise<unknown>,
  options: { iterations?: number; warmup?: number; prepare?: (i: number) => unknown } = {},
): Promise<Stat> {
  const iterations = options.iterations ?? ITERATIONS;
  for (let i = 0; i < (options.warmup ?? 5); i++) await run(-1 - i);
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await run(i);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    name,
    n: times.length,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    max: times.at(-1)!,
  };
}

/* ----------------------------------------------------------------------------------------- */
/* Seeding                                                                                      */
/* ----------------------------------------------------------------------------------------- */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const BATCH = 5_000;

async function seedOrg(
  m: typeof import("@/lib/db/models"),
  crypto: {
    encrypt: typeof import("@/lib/crypto/envelope").encryptSecret;
    aad: typeof import("@/lib/services/webhook-secret").secretAad;
  },
  input: { name: string; emails: number; threads: number; events: number; secret: string },
) {
  const { Types } = await import("mongoose");
  const now = Date.now();
  const orgId = new Types.ObjectId();
  const insert = async (collection: { insertMany: (d: Doc[], o: object) => Promise<unknown> }, docs: Doc[]) => {
    for (let i = 0; i < docs.length; i += BATCH) {
      await collection.insertMany(docs.slice(i, i + BATCH), { ordered: false });
    }
  };

  await m.OrgSettingsModel.collection.insertOne({
    orgId,
    plan: "pro",
    planState: "active",
    timezone: "Europe/Berlin",
    billingPeriod: { start: new Date(now - 10 * DAY), end: new Date(now + 20 * DAY) },
    createdAt: new Date(now),
    updatedAt: new Date(now),
  });

  // Two connections with two domains each.
  const connections = [0, 1].map(() => new Types.ObjectId());
  const connectionDocs = connections.map((_id, i) => ({
    _id,
    orgId,
    name: `${input.name} ${i + 1}`,
    provider: "resend",
    resendTeamFingerprint: `fp-${_id}`,
    createdBy: new Types.ObjectId(),
    status: "active",
    apiKey: crypto.encrypt("re_perf_full", { aad: `connections:${_id}:apiKey` }),
    apiKeyLast4: "full",
    webhook: {
      resendId: `wh_${_id}`,
      signingSecret: crypto.encrypt(input.secret, { aad: crypto.aad(_id) }),
      events: ["email.sent"],
      registeredAt: new Date(now),
    },
    deletedAt: null,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  }));
  await m.ConnectionModel.collection.insertMany(connectionDocs);

  const domains = connections.flatMap((connectionId, ci) =>
    [0, 1].map((di) => ({
      _id: new Types.ObjectId(),
      orgId,
      connectionId,
      resendId: `dom_${connectionId}_${di}`,
      name: `d${ci}${di}.${input.name.toLowerCase().replace(/\W/g, "")}.test`,
      status: "verified",
      openTracking: true,
      clickTracking: true,
      projectId: null,
      receiving: { enabled: di === 0, mxVerified: di === 0 },
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })),
  );
  await m.DomainModel.collection.insertMany(domains);

  const people = Array.from({ length: 2_000 }, (_, i) => `person${i}@customer${i % 300}.test`);
  const subjects = [
    "Where is my order?",
    "Invoice question",
    "Password reset",
    "Welcome aboard",
    "Your receipt",
    "Partnership inquiry",
    "Feature request",
    "Refund please",
  ];

  // Threads (inbound conversations) and their emails.
  const threadDocs: Doc[] = [];
  const emailDocs: Doc[] = [];
  let emailBudget = input.emails;
  const perThread = Math.max(1, Math.floor((input.emails * 0.3) / Math.max(input.threads, 1)));
  for (let t = 0; t < input.threads && emailBudget > 0; t++) {
    const threadId = new Types.ObjectId();
    const domain = pick(domains.filter((d) => (d.receiving as { enabled: boolean }).enabled));
    const who = pick(people);
    const subject = pick(subjects);
    const count = Math.min(emailBudget, 1 + Math.floor(rand() * perThread * 2));
    const start = now - Math.floor(rand() * 30 * DAY);
    let last = start;
    for (let k = 0; k < count; k++) {
      const at = start + k * Math.floor(rand() * 6 * HOUR);
      last = at;
      const inbound = k % 2 === 0;
      emailDocs.push({
        _id: new Types.ObjectId(),
        orgId,
        connectionId: domain.connectionId,
        resendId: `em_${t}_${k}_${input.name}`,
        direction: inbound ? "inbound" : "outbound",
        origin: inbound ? "external" : "app",
        domainId: domain._id,
        projectId: null,
        threadId,
        from: { address: inbound ? who : `support@${domain.name}` },
        to: [{ address: inbound ? `support@${domain.name}` : who }],
        cc: [],
        bcc: [],
        replyTo: [],
        recipientAddresses: [inbound ? `support@${domain.name}` : who],
        subject: inbound ? subject : `Re: ${subject}`,
        snippet: "Thanks for getting in touch. We looked into this and here is what we found.",
        tags: [],
        hasAttachments: false,
        status: inbound ? "received" : weighted([["delivered", 8], ["opened", 2]] as const),
        ...(inbound ? { receivedAt: new Date(at), contentStatus: "ready" } : { sentAt: new Date(at) }),
        openCount: 0,
        clickCount: 0,
        meteredAt: new Date(at),
        trashedAt: null,
        purgeAt: null,
        expireAt: null,
        createdAt: new Date(at),
        updatedAt: new Date(at),
      });
    }
    emailBudget -= count;
    threadDocs.push({
      _id: threadId,
      orgId,
      connectionId: domain.connectionId,
      domainId: domain._id,
      projectId: null,
      mailboxAddress: `support@${domain.name}`,
      subject,
      subjectKey: subject.toLowerCase(),
      participants: [who],
      messageCount: count,
      lastMessageAt: new Date(last),
      lastInboundAt: new Date(last),
      snippet: "Thanks for getting in touch.",
      hasAttachments: false,
      assigneeId: null,
      labelIds: [],
      starred: rand() < 0.05,
      archived: rand() < 0.1,
      trashedAt: null,
      purgeAt: null,
      expireAt: null,
      createdAt: new Date(start),
      updatedAt: new Date(last),
    });
  }

  // The rest of the volume: outbound transactional and broadcast mail spread over 90 days.
  const statusMix = [
    ["delivered", 70],
    ["opened", 14],
    ["clicked", 3],
    ["sent", 5],
    ["bounced", 4],
    ["failed", 2],
    ["complained", 1],
    ["delivery_delayed", 1],
  ] as const;
  while (emailBudget > 0) {
    const domain = pick(domains);
    const who = pick(people);
    const at = now - Math.floor(rand() * 90 * DAY);
    const status = weighted(statusMix);
    emailDocs.push({
      _id: new Types.ObjectId(),
      orgId,
      connectionId: domain.connectionId,
      resendId: `em_o_${emailBudget}_${input.name}`,
      direction: "outbound",
      origin: rand() < 0.2 ? "broadcast" : "app",
      domainId: domain._id,
      projectId: null,
      threadId: null,
      from: { address: `hello@${domain.name}` },
      to: [{ address: who }],
      cc: [],
      bcc: [],
      replyTo: [],
      recipientAddresses: [who],
      subject: `Update ${emailBudget % 97}`,
      snippet: "Here is your monthly update.",
      tags: [{ name: "campaign", value: `c${emailBudget % 20}` }],
      hasAttachments: false,
      status,
      sentAt: new Date(at),
      openCount: status === "opened" || status === "clicked" ? 1 : 0,
      clickCount: status === "clicked" ? 1 : 0,
      meteredAt: new Date(at),
      trashedAt: null,
      purgeAt: null,
      expireAt: null,
      createdAt: new Date(at),
      updatedAt: new Date(at),
    });
    emailBudget--;
  }
  await insert(m.EmailModel.collection, emailDocs);
  await insert(m.ThreadModel.collection, threadDocs);

  // Read state for half of the threads (the inbox lookup joins on it).
  const stateUser = new Types.ObjectId();
  await insert(
    m.ThreadMemberStateModel.collection,
    threadDocs
      .filter((_, i) => i % 2 === 0)
      .map((t) => ({
        orgId,
        threadId: t._id,
        userId: stateUser,
        lastReadAt: t.lastMessageAt,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })),
  );

  // Webhook events (raw, retained 30 days).
  const eventTypes = [
    ["email.delivered", 60],
    ["email.opened", 20],
    ["email.sent", 10],
    ["email.clicked", 5],
    ["email.bounced", 3],
    ["email.complained", 1],
    ["email.received", 1],
  ] as const;
  const events: Doc[] = [];
  for (let i = 0; i < input.events; i++) {
    const at = now - Math.floor(rand() * 30 * DAY);
    const e = emailDocs[i % emailDocs.length]!;
    events.push({
      orgId,
      connectionId: e.connectionId,
      svixId: `msg_seed_${input.name}_${i}`,
      type: weighted(eventTypes),
      occurredAt: new Date(at),
      resendObjectId: e.resendId,
      emailId: e._id,
      payload: { email_id: e.resendId, subject: e.subject, to: [(e.to as { address: string }[])[0]!.address] },
      processedAt: new Date(at + 1_000),
      expireAt: new Date(now + 30 * DAY),
      createdAt: new Date(at),
    });
  }
  await insert(m.WebhookEventModel.collection, events);

  // Rollups: hourly for 36 days and daily for 100 days, per connection and domain.
  const rollups: Doc[] = [];
  const counts = () => {
    const sent = Math.floor(rand() * 40);
    const delivered = Math.floor(sent * 0.96);
    return {
      sent,
      delivered,
      delivery_delayed: 0,
      bounced_hard: Math.floor(sent * 0.02),
      bounced_soft: Math.floor(sent * 0.01),
      complained: 0,
      opened_unique: Math.floor(delivered * 0.4),
      opened_total: Math.floor(delivered * 0.5),
      clicked_unique: Math.floor(delivered * 0.1),
      clicked_total: Math.floor(delivered * 0.12),
      failed: 0,
      suppressed: 0,
      received: Math.floor(rand() * 5),
      replied: Math.floor(rand() * 2),
    };
  };
  const dimensions = [
    { kind: "all", value: "" },
    { kind: "stream", value: "transactional" },
    { kind: "stream", value: "broadcast" },
  ];
  const buckets: { granularity: "hour" | "day"; count: number; step: number; ttl: number }[] = [
    { granularity: "hour", count: 36 * 24, step: HOUR, ttl: 35 },
    { granularity: "day", count: 100, step: DAY, ttl: 800 },
  ];
  for (const b of buckets) {
    const end = Math.floor(now / b.step) * b.step;
    for (let i = 0; i < b.count; i++) {
      const start = new Date(end - i * b.step);
      for (const d of domains) {
        for (const dimension of dimensions) {
          rollups.push({
            orgId,
            granularity: b.granularity,
            bucketStart: start,
            connectionId: d.connectionId,
            domainId: d._id,
            projectId: null,
            dimension,
            counts: counts(),
            deliveryLatencyMs: { buckets: new Array(9).fill(0), count: 0, sum: 0 },
            expireAt: new Date(now + b.ttl * DAY),
            createdAt: new Date(now),
            updatedAt: new Date(now),
          });
        }
      }
    }
  }
  await insert(m.MetricRollupModel.collection, rollups);

  return {
    orgId,
    connectionId: connections[0]!,
    stateUser,
    counts: {
      emails: emailDocs.length,
      threads: threadDocs.length,
      events: events.length,
      rollups: rollups.length,
    },
  };
}

/* ----------------------------------------------------------------------------------------- */
/* Main                                                                                         */
/* ----------------------------------------------------------------------------------------- */

type ProfileEntry = {
  op: string;
  ns: string;
  millis: number;
  planSummary?: string;
  docsExamined?: number;
  keysExamined?: number;
  nreturned?: number;
  hasSortStage?: boolean;
  command?: Doc;
};

type PlanReport = {
  scenario: string;
  collection: string;
  op: string;
  plan: string;
  keys: number;
  docs: number;
  returned: number;
  sort: boolean;
  ms: number;
  collscan: boolean;
};

async function main() {
  const [{ connectDb, disconnectDb }, models, envelope, hook, mongooseMod, perms] =
    await Promise.all([
      import("@/lib/db/connect"),
      import("@/lib/db/models"),
      import("@/lib/crypto/envelope"),
      import("@/lib/services/webhook-secret"),
      import("mongoose"),
      import("@/lib/auth/permissions"),
    ]);
  const { Types } = mongooseMod;
  await connectDb();
  const db = mongooseMod.default.connection.db!;
  await Promise.all(
    Object.values(models).map((model) => (model as { init?: () => Promise<unknown> }).init?.()),
  );

  const marker = db.collection("perf_meta");
  const existing = await marker.findOne({ _id: "seed" as never });
  const wanted = { N_EMAILS, N_THREADS, N_EVENTS, NOISE_ORGS };
  let target: {
    orgId: InstanceType<typeof Types.ObjectId>;
    connectionId: InstanceType<typeof Types.ObjectId>;
    stateUser: InstanceType<typeof Types.ObjectId>;
    secret: string;
    counts: Record<string, number>;
  };

  const sameSeed = existing && JSON.stringify(existing.wanted) === JSON.stringify(wanted);
  if (args.reseed || !sameSeed) {
    console.log("[perf] Seeding (this takes a while)...");
    const t0 = Date.now();
    await db.dropDatabase();
    // Noise first: other tenants' data must not slow the target org down.
    for (let i = 0; i < NOISE_ORGS; i++) {
      await seedOrg(
        models,
        { encrypt: envelope.encryptSecret, aad: hook.secretAad },
        {
          name: `Noise${i}`,
          emails: Math.floor(N_EMAILS / 5),
          threads: Math.floor(N_THREADS / 5),
          events: Math.floor(N_EVENTS / 5),
          secret: "whsec_" + Buffer.from("noise").toString("base64"),
        },
      );
    }
    const secret = "whsec_" + Buffer.from("perf-target-secret-perf-target!").toString("base64");
    const seeded = await seedOrg(
      models,
      { encrypt: envelope.encryptSecret, aad: hook.secretAad },
      { name: "Target", emails: N_EMAILS, threads: N_THREADS, events: N_EVENTS, secret },
    );
    target = { ...seeded, secret };
    await marker.replaceOne(
      { _id: "seed" as never },
      {
        _id: "seed" as never,
        wanted,
        orgId: target.orgId,
        connectionId: target.connectionId,
        stateUser: target.stateUser,
        secret,
        counts: target.counts,
      },
      { upsert: true },
    );
    // Build indexes after the load (faster). `init()` would be a no-op here: Mongoose caches it,
    // and the database was just dropped.
    console.log("[perf] Building indexes...");
    await Promise.all(
      Object.values(models).map((model) =>
        (model as { createIndexes?: () => Promise<unknown> }).createIndexes?.(),
      ),
    );
    console.log(`[perf] Seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s`, target.counts);
  } else {
    target = existing as unknown as typeof target;
    console.log("[perf] Reusing existing seed", target.counts);
  }

  const totals = {
    emails: await db.collection("emails").estimatedDocumentCount(),
    threads: await db.collection("threads").estimatedDocumentCount(),
    events: await db.collection("webhook_events").estimatedDocumentCount(),
    rollups: await db.collection("metric_rollups").estimatedDocumentCount(),
    orgs: await db.collection("org_settings").estimatedDocumentCount(),
  };

  const orgId = target.orgId.toHexString();
  const ctx = {
    user: { id: target.stateUser.toHexString(), name: "Perf", email: "perf@example.com", image: null },
    org: { id: orgId, name: "Target", slug: "target" },
    role: "owner",
    orgs: [],
    memberId: new Types.ObjectId().toHexString(),
    projectScope: null,
    can: (permission: never) => perms.roleHasPermission("owner", permission),
  } as unknown as import("@/lib/dal").OrgContext;

  const [{ listThreads, listActivity }, { getInsights }, { getOverview }, ingest] =
    await Promise.all([
      import("@/lib/services/emails"),
      import("@/lib/services/insights"),
      import("@/components/app/overview-data"),
      import("@/app/api/ingest/resend/[connectionId]/route"),
    ]);
  const { signWebhook } = await import("@/lib/resend/events");
  const { NextRequest } = await import("next/server");

  const stats: Stat[] = [];
  const plans: PlanReport[] = [];

  async function profiled(scenario: string, run: () => Promise<Stat>) {
    await db.command({ profile: 0 });
    await db.collection("system.profile").drop().catch(() => {});
    // Warm-up runs inside `run`; the profiler only records the timed part plus warm-up (both
    // are the same queries, so the plan report is identical).
    await db.command({ profile: 2, slowms: 0 });
    const stat = await run();
    await db.command({ profile: 0 });
    stats.push(stat);
    const entries = await db
      .collection<ProfileEntry>("system.profile")
      .find({ ns: { $regex: `^${dbName}\\.(?!system\\.)` }, op: { $in: ["query", "command", "getmore"] } })
      .toArray();
    const byShape = new Map<string, PlanReport>();
    for (const e of entries) {
      const collection = e.ns.split(".").slice(1).join(".");
      if (collection === "perf_meta" || collection.startsWith("system.")) continue;
      // $or plans repeat the same index per branch: show each distinct stage once.
      const parts = (e.planSummary ?? "(none)").split(/, (?=[A-Z_]+ )/);
      const counts = new Map<string, number>();
      for (const part of parts) counts.set(part, (counts.get(part) ?? 0) + 1);
      const plan = [...counts].map(([part, n]) => (n > 1 ? `${part} x${n}` : part)).join(", ");
      const key = `${collection}|${e.op}|${plan}`;
      const prev = byShape.get(key);
      const report: PlanReport = {
        scenario,
        collection,
        op: e.op,
        plan,
        keys: Math.max(prev?.keys ?? 0, e.keysExamined ?? 0),
        docs: Math.max(prev?.docs ?? 0, e.docsExamined ?? 0),
        returned: Math.max(prev?.returned ?? 0, e.nreturned ?? 0),
        sort: (prev?.sort ?? false) || !!e.hasSortStage,
        ms: Math.max(prev?.ms ?? 0, e.millis),
        collscan: plan.startsWith("COLLSCAN"),
      };
      byShape.set(key, report);
    }
    plans.push(...byShape.values());
  }

  // 1. Ingest: signed request through the route handler (verify, dedupe, store, enqueue).
  const eventTemplate = (i: number) =>
    JSON.stringify({
      type: "email.delivered",
      created_at: new Date().toISOString(),
      data: { email_id: `em_perf_${i}`, from: "a@b.test", to: ["c@d.test"], subject: "Perf" },
    });
  const connectionIdHex = target.connectionId.toHexString();
  let ingestSeq = 0;
  await profiled("ingest", () => {
    // Pre-sign so signing cost is not part of the handler time.
    const total = ITERATIONS + 5;
    const requests = Array.from({ length: total }, () => {
      const body = eventTemplate(ingestSeq++);
      return { body, headers: signWebhook(target.secret, body, { id: `msg_perf_${Date.now()}_${ingestSeq}` }) };
    });
    return measure(
      "Ingest route handler (POST /api/ingest/resend/[id])",
      async (i) => {
        const r = requests[i < 0 ? total + i : i]!;
        const res = await ingest.POST(
          new NextRequest(`http://localhost/api/ingest/resend/${connectionIdHex}`, {
            method: "POST",
            body: r.body,
            headers: r.headers,
          }),
          { params: Promise.resolve({ connectionId: connectionIdHex }) } as never,
        );
        if (res.status !== 200) throw new Error(`ingest answered ${res.status}`);
      },
      { iterations: ITERATIONS, warmup: 5 },
    );
  });

  // 2. Inbox thread list: first page of 50, a deep page, and the unread filter.
  const firstPage = await listThreads(ctx, { folder: "inbox", limit: 50 });
  await profiled("inbox", () =>
    measure("Inbox thread list, 50 rows (first page)", () =>
      listThreads(ctx, { folder: "inbox", limit: 50 }),
    ),
  );
  await profiled("inbox-page-2", () =>
    measure("Inbox thread list, 50 rows (page 2 by cursor)", () =>
      listThreads(ctx, { folder: "inbox", limit: 50, cursor: firstPage.nextCursor }),
    ),
  );
  await profiled("inbox-unread", () =>
    measure("Inbox thread list, 50 rows (unread filter)", () =>
      listThreads(ctx, { folder: "inbox", limit: 50, unread: true }),
    ),
  );

  // 3. Overview rollups (server first paint), 4. Activity list, 5. Insights.
  await profiled("overview", () => measure("Overview dashboard (7 day rollups)", () => getOverview(ctx)));
  await profiled("activity", () =>
    measure("Activity list, 50 rows", () => listActivity(ctx, { limit: 50 })),
  );
  await profiled("activity-filtered", () =>
    measure("Activity list, 50 rows (status = bounced)", () =>
      listActivity(ctx, { limit: 50, filters: { statuses: ["bounced"] } }),
    ),
  );
  await profiled("activity-delivered", () =>
    measure("Activity list, 50 rows (status = delivered)", () =>
      listActivity(ctx, { limit: 50, filters: { statuses: ["delivered"] } }),
    ),
  );
  await profiled("activity-connection", () =>
    measure("Activity list, 50 rows (one connection)", () =>
      listActivity(ctx, { limit: 50, filters: { connectionId: connectionIdHex } }),
    ),
  );
  await profiled("activity-inbound", () =>
    measure("Activity list, 50 rows (inbound only)", () =>
      listActivity(ctx, { limit: 50, filters: { direction: "inbound" } }),
    ),
  );
  await profiled("sent", () =>
    measure("Sent folder, 50 rows", () => listThreads(ctx, { folder: "sent", limit: 50 })),
  );
  await profiled("insights-30d", () =>
    measure("Insights, 30 days", () => getInsights(ctx, { days: 30 })),
  );
  await profiled("insights-7d", () => measure("Insights, 7 days", () => getInsights(ctx, { days: 7 })));
  await profiled("insights-90d", () =>
    measure("Insights, 90 days", () => getInsights(ctx, { days: 90 })),
  );

  const targets: Record<string, number> = {
    Ingest: 300,
    "Inbox thread list": 400,
    Overview: 800,
  };
  const budget = (name: string) =>
    Object.entries(targets).find(([prefix]) => name.startsWith(prefix))?.[1];

  const f = (n: number) => n.toFixed(1);
  if (args.json) {
    console.log(JSON.stringify({ totals, stats, plans }, null, 2));
  } else {
    console.log(
      `\nDataset: ${totals.emails.toLocaleString()} emails, ${totals.threads.toLocaleString()} threads, ` +
        `${totals.events.toLocaleString()} events, ${totals.rollups.toLocaleString()} rollups, ${totals.orgs} orgs ` +
        `(target org: ${target.counts.emails?.toLocaleString()} emails / ${target.counts.threads?.toLocaleString()} threads / ${target.counts.events?.toLocaleString()} events)\n`,
    );
    console.log("| Scenario | n | p50 ms | p95 ms | p99 ms | max ms | Target p95 |");
    console.log("|---|---:|---:|---:|---:|---:|---|");
    for (const s of stats) {
      const b = budget(s.name);
      console.log(
        `| ${s.name} | ${s.n} | ${f(s.p50)} | ${f(s.p95)} | ${f(s.p99)} | ${f(s.max)} | ${
          b ? `< ${b} ms ${s.p95 < b ? "OK" : "MISS"}` : "-"
        } |`,
      );
    }
    console.log("\n| Scenario | Collection | Op | Plan | Keys | Docs | Returned | In-memory sort |");
    console.log("|---|---|---|---|---:|---:|---:|---|");
    for (const p of plans) {
      console.log(
        `| ${p.scenario} | ${p.collection} | ${p.op} | ${p.collscan ? "**COLLSCAN**" : p.plan} | ${p.keys} | ${p.docs} | ${p.returned} | ${p.sort ? "yes" : "no"} |`,
      );
    }
    const bad = plans.filter((p) => p.collscan);
    console.log(
      bad.length
        ? `\nCOLLSCAN on hot paths: ${bad.map((p) => `${p.scenario}:${p.collection}`).join(", ")}`
        : "\nNo COLLSCAN on any hot path.",
    );
  }

  await disconnectDb();
  process.exit(plans.some((p) => p.collscan) ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
