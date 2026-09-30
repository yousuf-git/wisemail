/**
 * Development seed: demo workspaces across every plan, users in every role, fake Resend
 * connections with synced data, mail, events, ~30 days of metrics, alerts and notifications, plus
 * a platform admin for the /admin panel.
 *
 *   pnpm db:seed                 add what is missing (idempotent: finished workspaces are skipped)
 *   pnpm db:seed --reset         drop the dev database first, then seed from scratch
 *   pnpm db:seed --force-remote  allow a MONGODB_URI whose host is not localhost / 127.0.0.1
 *
 * Safety: never runs with NODE_ENV=production; refuses non-local MONGODB_URI hosts without
 * `--force-remote`; `--reset` only ever drops a database named "wisemail" (the dev database in
 * `.env.example`), never a test, e2e or remote database by accident.
 *
 * Everything goes through the real services and Better Auth's server API, so the data is what the
 * app itself would have created. Resend, storage and AI are the in-memory / on-disk fakes, jobs
 * are run by this script instead of Inngest, and needs `pnpm db:dev` (MongoDB replica set).
 * All seeded users share one password, printed at the end together with the credentials table.
 */
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";

const startedAt = Date.now();
const args = new Set(process.argv.slice(2));
const RESET = args.has("--reset");
const FORCE_REMOTE = args.has("--force-remote");

const SEED_PASSWORD = "wisemail-dev-123";
/** The one database `--reset` may drop: the dev database named in `.env.example`. */
const DEV_DB_NAME = "wisemail";

/* ------------------------------------------------------------------------------------------ */
/* Guards (before anything touches the database)                                               */
/* ------------------------------------------------------------------------------------------ */

const nodeEnv = () => (process.env as Record<string, string | undefined>).NODE_ENV;

function die(message: string): never {
  console.error(`\nseed: ${message}\n`);
  process.exit(1);
}

if (nodeEnv() === "production") die("refusing to run with NODE_ENV=production.");

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
if (nodeEnv() === "production") die("refusing to run with NODE_ENV=production.");

const uri = process.env.MONGODB_URI;
if (!uri) die("MONGODB_URI is not set (copy .env.example to .env.local and run `pnpm db:dev`).");

function parseMongoUri(value: string) {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)(?:\/([^?]*))?/.exec(value);
  if (!match) die("MONGODB_URI is not a valid MongoDB connection string.");
  const hosts = match[1]!.split(",").map((h) => h.replace(/:\d+$/, "").replace(/^\[|\]$/g, ""));
  return { hosts, dbName: decodeURIComponent(match[2] ?? "") };
}
const { hosts, dbName } = parseMongoUri(uri);
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (!FORCE_REMOTE && (uri.startsWith("mongodb+srv") || !hosts.every((h) => localHosts.has(h)))) {
  die(
    `MONGODB_URI points at ${hosts.join(", ")}, not localhost. ` +
      "Pass --force-remote if you really mean to seed that database.",
  );
}
if (RESET && dbName !== DEV_DB_NAME) {
  die(
    `--reset only drops the dev database "${DEV_DB_NAME}", but MONGODB_URI uses "${dbName || "(default)"}". ` +
      "Nothing was changed.",
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Environment for running the server modules in plain Node                                    */
/* ------------------------------------------------------------------------------------------ */

function stubModule(id: string, exports: unknown) {
  const file = require.resolve(id);
  require.cache[file] = { id: file, filename: file, loaded: true, exports } as never;
}

/** What the next `headers()` call (Better Auth calls through the services) sees. */
const requestHeaders = { current: new Headers() };

// `server-only` throws outside the Next.js bundle; `next/headers` needs a request scope.
stubModule("server-only", {});
stubModule("next/headers", {
  headers: async () => requestHeaders.current,
  cookies: async () => ({
    get() {},
    set() {},
    delete() {},
    has: () => false,
    getAll: () => [],
  }),
});

// Test semantics: jobs are recorded instead of sent (this script plays Inngest), no sync delays.
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.RESEND_MODE = "fake";
process.env.STORAGE_MODE = "fake";
process.env.AI_MODE = "fake";
process.env.BILLING_ENABLED = "false";
process.env.PLATFORM_ADMIN_EMAILS = "admin@wisemail.test";
// Test mode would put fake storage in a temp dir; the dev server must see the files.
(globalThis as unknown as { __wisemailFakeStorageRoot?: string }).__wisemailFakeStorageRoot =
  path.resolve(process.cwd(), ".data", "storage");

/* ------------------------------------------------------------------------------------------ */
/* What gets seeded                                                                            */
/* ------------------------------------------------------------------------------------------ */

type OrgRole = "owner" | "admin" | "developer" | "support" | "viewer";
type Plan = "free" | "pro" | "team" | "agency";

type Person = { email: string; name: string };
type Member = Person & { role: OrgRole; scopedTo?: string };
type ConnectionSpec = {
  name: string;
  /** Fake Resend key; see "Fake Resend keys" in AGENTS.md for the flags. */
  key: string;
  /** Skip sync, mail and metrics (a connection that needs attention). */
  broken?: boolean;
};
type Workspace = {
  slug: string;
  name: string;
  plan: Plan;
  owner: Person;
  members: Member[];
  invite?: { email: string; role: OrgRole };
  projects?: { name: string; color: string }[];
  /** Project that receives the main domain, so a scoped member sees mail. */
  domainProject?: string;
  connections: ConnectionSpec[];
  /** Busy-ness of the synthetic history and real mail. */
  scale: 1 | 2 | 4;
  /** Real inbound/outbound mail needs files stored by us (paid plans). */
  mail: boolean;
  alerts: boolean;
};

const p = (email: string, name: string): Person => ({ email: `${email}@wisemail.test`, name });

const ADMIN = p("admin", "Ada Platform");

const WORKSPACES: Workspace[] = [
  {
    slug: "side-hustle",
    name: "Side Hustle Co",
    plan: "free",
    owner: p("free.owner", "Fiona Free"),
    members: [{ ...p("free.viewer", "Vic Viewer"), role: "viewer" }],
    connections: [{ name: "Main Resend", key: "re_sidehustle_full" }],
    scale: 1,
    mail: false,
    alerts: false,
  },
  {
    slug: "pixel-post",
    name: "Pixel Post",
    plan: "pro",
    owner: p("pro.owner", "Pia Pro"),
    members: [
      { ...p("pro.developer", "Dev Pro"), role: "developer" },
      { ...p("pro.support", "Sam Support"), role: "support" },
      { ...p("pro.viewer", "Vera Viewer"), role: "viewer" },
    ],
    invite: { email: "invitee.pro@wisemail.test", role: "support" },
    connections: [{ name: "Pixel Post Resend", key: "re_pixelpost_full" }],
    scale: 1,
    mail: true,
    alerts: true,
  },
  {
    slug: "northwind-labs",
    name: "Northwind Labs",
    plan: "team",
    owner: p("team.owner", "Tom Team"),
    members: [
      { ...p("team.admin", "Ana Admin"), role: "admin" },
      { ...p("team.developer", "Dan Developer"), role: "developer" },
      { ...p("team.support", "Sue Support"), role: "support" },
      { ...p("team.viewer", "Vik Viewer"), role: "viewer" },
      { ...p("team.scoped", "Skye Scoped"), role: "support", scopedTo: "Marketing" },
    ],
    invite: { email: "team.invitee@wisemail.test", role: "developer" },
    projects: [
      { name: "Marketing", color: "coral" },
      { name: "Product", color: "engaged" },
    ],
    domainProject: "Marketing",
    connections: [{ name: "Northwind Resend", key: "re_northwind_manycontacts" }],
    scale: 2,
    mail: true,
    alerts: true,
  },
  {
    slug: "brightside-agency",
    name: "Brightside Agency",
    plan: "agency",
    owner: p("agency.owner", "Olly Agency"),
    members: [
      { ...p("agency.admin", "Amy Admin"), role: "admin" },
      { ...p("agency.developer", "Drew Developer"), role: "developer" },
      // One person in two workspaces (shows the workspace switcher).
      { ...p("team.admin", "Ana Admin"), role: "developer" },
    ],
    projects: [
      { name: "Acme", color: "accent" },
      { name: "Globex", color: "success" },
    ],
    connections: [
      { name: "Brightside US", key: "re_brightside_allgood" },
      { name: "Brightside EU", key: "re_brightsideeu_slotfull", broken: true },
    ],
    scale: 4,
    mail: true,
    alerts: true,
  },
];

/* ------------------------------------------------------------------------------------------ */
/* Helpers                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/** Small deterministic PRNG so two seeds look the same. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const log = (line: string) => console.log(line);
const HOUR = 3_600_000;
const DAY = 86_400_000;

async function main() {
  const { MongoClient } = await import("mongodb");

  if (RESET) {
    const client = new MongoClient(uri!);
    try {
      await client.connect();
      await client.db(dbName).dropDatabase();
    } finally {
      await client.close();
    }
    await rm(path.resolve(process.cwd(), ".data", "storage"), { recursive: true, force: true });
    log(`Dropped database "${dbName}" and .data/storage.`);
  }

  const { default: mongoose, Types } = await import("mongoose");
  const models = await import("@/lib/db/models");
  const { connectDb, disconnectDb } = await import("@/lib/db/connect");
  const { auth } = await import("@/lib/auth/server");
  const dal = await import("@/lib/dal");
  const { applyPlanChange } = await import("@/lib/services/plan-changes");
  const { createProject } = await import("@/lib/services/projects");
  const { inviteMember } = await import("@/lib/services/members");
  const { addConnection } = await import("@/lib/services/connections");
  const { runSyncInline } = await import("@/lib/services/sync");
  const { createSender } = await import("@/lib/services/senders");
  const { sendEmail } = await import("@/lib/services/sending");
  const { markThreadRead, trashItems } = await import("@/lib/services/threads");
  const { listThreads } = await import("@/lib/services/emails");
  const { createAlertRule } = await import("@/lib/services/alerts");
  const { createNotifications } = await import("@/lib/services/notifications");
  const { incrementRollups } = await import("@/lib/services/rollups");
  const { ingestResendWebhook } = await import("@/lib/services/ingest");
  const { processWebhookEvent } = await import("@/lib/services/events-processing");
  const { fetchInboundEmail } = await import("@/lib/services/inbound");
  const { readWebhookSigningSecret } = await import("@/lib/services/webhook-secret");
  const { signWebhook } = await import("@/lib/resend/events");
  const { createFakeReceivedEmail } = await import("@/lib/resend/fake-adapter");
  const { sentJobs, resetSentJobs } = await import("@/lib/jobs/send");
  const { dayKey } = await import("@/lib/billing/metering");

  await connectDb();
  await Promise.all(
    Object.values(models).map((m) => (m as { init?: () => Promise<unknown> }).init?.()),
  );
  const db = mongoose.connection;
  const meta = db.collection<{ _id: string; at: Date }>("seed_meta");

  /* ---- users ---- */

  const cookies = new Map<string, Headers>();

  async function ensureUser(person: Person) {
    const existing = await db.collection("user").findOne({ email: person.email });
    if (!existing) {
      await auth.api.signUpEmail({
        body: { name: person.name, email: person.email, password: SEED_PASSWORD },
      });
    }
    // What clicking the emailed link does.
    await db
      .collection("user")
      .updateOne({ email: person.email }, { $set: { emailVerified: true, name: person.name } });
    const row = await db.collection("user").findOne({ email: person.email });
    return String(row!._id);
  }

  /** Signs in (cached) and returns the session cookie header. */
  async function session(person: Person) {
    const cached = cookies.get(person.email);
    if (cached) return cached;
    const res = await auth.api.signInEmail({
      body: { email: person.email, password: SEED_PASSWORD },
      returnHeaders: true,
    });
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const headers = new Headers({ cookie });
    cookies.set(person.email, headers);
    return headers;
  }

  /** The real org context for `person` in `slug` (same lookup the app does per request). */
  async function ctxFor(person: Person, slug: string) {
    requestHeaders.current = await session(person);
    const result = await dal.getOrgContext(slug);
    if (result.status !== "ok") throw new Error(`no access to ${slug} as ${person.email}`);
    return result.ctx;
  }

  /* ---- platform admin ---- */

  await ensureUser(ADMIN);
  await session(ADMIN); // sign-in promotes the allowlisted address to the "admin" role
  const adminRow = await db.collection("user").findOne({ email: ADMIN.email });
  if (adminRow?.role !== "admin") {
    await db.collection("user").updateOne({ email: ADMIN.email }, { $set: { role: "admin" } });
  }
  log(`Platform admin ready: ${ADMIN.email}`);

  const credentials: { email: string; role: string; workspace: string; plan: string }[] = [
    { email: ADMIN.email, role: "platform admin", workspace: "(none: /admin)", plan: "-" },
  ];

  /* ---- workspaces ---- */

  for (const ws of WORKSPACES) {
    const marker = await meta.findOne({ _id: `workspace:${ws.slug}` });
    const orgRow = await db.collection("organization").findOne({ slug: ws.slug });

    const everyone: (Person & { role: OrgRole })[] = [
      { ...ws.owner, role: "owner" },
      ...ws.members,
    ];
    for (const person of everyone) {
      await ensureUser(person);
      if (!credentials.some((c) => c.email === person.email && c.workspace === ws.name)) {
        credentials.push({
          email: person.email,
          role:
            person.role +
            ((person as Member).scopedTo ? ` (only ${(person as Member).scopedTo})` : ""),
          workspace: ws.name,
          plan: ws.plan,
        });
      }
    }
    if (ws.invite) {
      credentials.push({
        email: ws.invite.email,
        role: `${ws.invite.role} (pending invitation)`,
        workspace: ws.name,
        plan: ws.plan,
      });
    }

    if (marker) {
      log(`Skipping ${ws.name}: already seeded.`);
      continue;
    }
    if (orgRow) {
      log(
        `Skipping ${ws.name}: the workspace exists but its seed never finished. ` +
          "Re-run with --reset to start clean.",
      );
      continue;
    }

    log(`Seeding ${ws.name} (${ws.plan})...`);
    const rand = rng(ws.slug);

    // Organization, plan, members.
    requestHeaders.current = await session(ws.owner);
    const org = await auth.api.createOrganization({
      headers: requestHeaders.current,
      body: { name: ws.name, slug: ws.slug },
    });
    const orgId = new Types.ObjectId(org.id);
    const ownerId = new Types.ObjectId(await ensureUser(ws.owner));
    if (ws.plan !== "free") {
      await applyPlanChange(orgId, ws.plan, { actorId: ownerId, reason: "owner" });
    }
    for (const m of ws.members) {
      await auth.api.addMember({
        body: { userId: await ensureUser(m), role: m.role, organizationId: org.id },
      });
    }

    // Projects, scoped members, pending invitation.
    const owner = await ctxFor(ws.owner, ws.slug);
    const projects = new Map<string, string>();
    for (const project of ws.projects ?? []) {
      const created = await createProject(owner, {
        name: project.name,
        color: project.color as never,
      });
      projects.set(project.name, created.id);
    }
    for (const m of ws.members) {
      if (!m.scopedTo) continue;
      const row = await db
        .collection("member")
        .findOne({ organizationId: orgId, userId: new Types.ObjectId(await ensureUser(m)) });
      await models.MemberScopeModel.updateOne(
        { orgId, memberId: row!._id },
        { $set: { projectIds: [new Types.ObjectId(projects.get(m.scopedTo)!)] } },
        { upsert: true },
      );
    }
    if (ws.invite) {
      requestHeaders.current = await session(ws.owner);
      await inviteMember(owner, { email: ws.invite.email, role: ws.invite.role, projectIds: [] });
    }

    // Connections: real service path (validates the fake key, registers the webhook), then sync.
    type Conn = {
      id: string;
      key: string;
      oid: InstanceType<typeof Types.ObjectId>;
      domainId: InstanceType<typeof Types.ObjectId> | null;
      projectId: InstanceType<typeof Types.ObjectId> | null;
      mailbox: string | null;
      senderId: string | null;
    };
    const healthy: Conn[] = [];
    for (const spec of ws.connections) {
      requestHeaders.current = await session(ws.owner);
      const dto = await addConnection(owner, { name: spec.name, apiKey: spec.key });
      const oid = new Types.ObjectId(dto.id);
      if (spec.broken) {
        log(`  connection "${spec.name}" is ${dto.status} (${dto.statusReason ?? "no reason"})`);
        continue;
      }
      const synced = await runSyncInline({ connectionId: dto.id, trigger: "initial" });
      if (synced.status !== "done") throw new Error(`sync of ${spec.name} ended ${synced.status}`);
      const domain = await models.DomainModel.findOne({
        orgId,
        connectionId: oid,
        status: "verified",
        "receiving.enabled": true,
      });
      if (!domain) throw new Error(`no verified receiving domain for ${spec.name}`);
      const projectName = ws.domainProject;
      if (projectName && projects.has(projectName)) {
        await models.DomainModel.updateOne(
          { _id: domain._id },
          { $set: { projectId: new Types.ObjectId(projects.get(projectName)!) } },
        );
      }
      const fresh = await models.DomainModel.findById(domain._id);
      healthy.push({
        id: dto.id,
        key: spec.key,
        oid,
        domainId: fresh!._id,
        projectId: fresh!.projectId ?? null,
        mailbox: null,
        senderId: null,
      });
    }

    /** Delivers a signed webhook through ingest and runs what Inngest would (events, inbound). */
    async function deliver(conn: Conn, type: string, data: Record<string, unknown>, at: Date) {
      const secret = (await readWebhookSigningSecret(conn.id))!;
      resetSentJobs();
      const body = JSON.stringify({ type, created_at: at.toISOString(), data });
      const res = await ingestResendWebhook({
        connectionId: conn.id,
        rawBody: body,
        headers: new Headers(signWebhook(secret, body)),
      });
      if (res.status !== 200) throw new Error(`ingest answered ${res.status} for ${type}`);
      for (const job of [...sentJobs]) {
        if (job.name !== "resend/event.received") continue;
        const outcome = await processWebhookEvent(job.data.eventId);
        if (outcome.fetchInbound) await fetchInboundEmail(outcome.fetchInbound);
      }
    }

    // Mail: senders, inbound threads with files, replies, sent mail with events.
    if (ws.mail) {
      for (const conn of healthy) {
        const domain = (await models.DomainModel.findById(conn.domainId))!;
        const support = await createSender(owner, {
          domainId: domain._id.toHexString(),
          localPart: "support",
          displayName: `${ws.name} Support`,
          isDefault: true,
        });
        await createSender(owner, {
          domainId: domain._id.toHexString(),
          localPart: "hello",
          displayName: ws.name,
        });
        conn.mailbox = support.address;
        conn.senderId = support.id;
      }
      const conn = healthy[0]!;
      const mailbox = conn.mailbox!;
      const senderId = conn.senderId!;
      const inboundCount = 4 + ws.scale * 2;
      const customers = [
        ["Jane Doe", "jane@customer.test"],
        ["Marco Bianchi", "marco@bianchi.example"],
        ["Priya Nair", "priya@nairlabs.example"],
        ["Liam O'Connor", "liam@oconnor.example"],
        ["Sofia Martins", "sofia@martins.example"],
        ["Kenji Sato", "kenji@sato.example"],
        ["Hannah Weber", "hannah@weber.example"],
        ["Omar Haddad", "omar@haddad.example"],
        ["Chloe Dubois", "chloe@dubois.example"],
        ["Noah Fischer", "noah@fischer.example"],
      ] as const;
      const subjects = [
        "Invoice question",
        "Can't reset my password",
        "Bounced newsletter?",
        "Partnership proposal",
        "Refund for order #4821",
        "Feature request: dark mode",
        "Delivery delayed to Gmail",
        "Unsubscribe me please",
        "Quick question about pricing",
        "Logo files for the campaign",
      ];
      const inboundAt = (i: number) => new Date(Date.now() - (i * 7 + 2) * HOUR);
      const inboundIds: string[] = [];
      for (let i = 0; i < inboundCount; i++) {
        const [name, address] = customers[i % customers.length]!;
        const subject = subjects[i % subjects.length]!;
        const attachments =
          i % 3 === 0
            ? [
                {
                  filename: "Rechnung März.pdf",
                  contentType: "application/pdf",
                  content: "%PDF-1.4 seeded sample",
                },
              ]
            : i % 3 === 1
              ? [
                  {
                    filename: "screenshot.png",
                    contentType: "image/png",
                    content: Buffer.from(
                      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
                      "base64",
                    ),
                  },
                ]
              : undefined;
        const received = createFakeReceivedEmail(conn.key, {
          from: `${name} <${address}>`,
          to: [mailbox],
          subject,
          text: `Hi,\n\n${subject} - could you take a look when you get a chance?\n\nThanks,\n${name.split(" ")[0]}`,
          html: `<p>Hi,</p><p><b>${subject}</b> - could you take a look when you get a chance?</p><p>Thanks,<br>${name.split(" ")[0]}</p>`,
          date: inboundAt(i),
          attachments,
        });
        await deliver(conn, "email.received", received.event, inboundAt(i));
      }
      const inbox = await listThreads(owner, { folder: "inbox" });
      inboundIds.push(...inbox.items.map((t) => t.id));

      // Replies from us (threads with two messages), with delivered / opened events.
      const replyTo = inbox.items.slice(0, 3);
      for (const [index, thread] of replyTo.entries()) {
        const detail = await (await import("@/lib/services/emails")).getThread(owner, thread.id);
        const parent = detail.messages[0]!;
        const res = await sendEmail(owner, {
          senderId,
          to: [parent.from.address],
          subject: `Re: ${thread.subject}`,
          text: "Thanks for getting in touch - we are on it and will come back shortly.",
          inReplyToEmailId: parent.id,
        });
        const doc = (await models.EmailModel.findById(res.emailId))!;
        const base = {
          email_id: doc.resendId!,
          from: mailbox,
          to: [parent.from.address],
          subject: `Re: ${thread.subject}`,
          tags: { mw_email: res.emailId },
        };
        const at = new Date(Date.now() - (index + 1) * 40 * 60_000);
        await deliver(conn, "email.sent", { ...base, created_at: at.toISOString() }, at);
        await deliver(
          conn,
          "email.delivered",
          { ...base, created_at: at.toISOString() },
          new Date(at.getTime() + 4000),
        );
        if (index < 2) {
          const opened = new Date(at.getTime() + 25 * 60_000);
          await deliver(
            conn,
            "email.opened",
            { ...base, created_at: opened.toISOString() },
            opened,
          );
        }
      }

      // Outbound mail with a spread of outcomes.
      const outbound = [
        ["Welcome to " + ws.name, "delivered+opened+clicked"],
        ["Your receipt #1042", "delivered+opened"],
        ["Password reset requested", "delivered"],
        ["Shipping update for order 4821", "delivered+opened"],
        ["Invoice March", "delivered"],
        ["We miss you", "bounced"],
        ["Quarterly newsletter", "delivered+opened+clicked"],
        ["Your trial is ending", "bounced"],
      ] as const;
      const recipients = [
        "ana@example.org",
        "bob@example.net",
        "carla@example.com",
        "dmitri@example.io",
      ];
      for (const [index, [subject, outcome]] of outbound.entries()) {
        const to =
          index === 5 ? "nobody@invalid-domain.example" : recipients[index % recipients.length]!;
        const res = await sendEmail(owner, {
          senderId,
          to: [to],
          subject,
          text: `${subject}\n\nSent by the seed script.`,
        });
        const doc = (await models.EmailModel.findById(res.emailId))!;
        const base = {
          email_id: doc.resendId!,
          from: mailbox,
          to: [to],
          subject,
          tags: { mw_email: res.emailId },
        };
        const at = new Date(Date.now() - (index + 1) * 3 * HOUR);
        const fire = (type: string, offsetMs: number, extra: Record<string, unknown> = {}) => {
          const when = new Date(at.getTime() + offsetMs);
          return deliver(conn, type, { ...base, created_at: when.toISOString(), ...extra }, when);
        };
        await fire("email.sent", 0);
        if (outcome === "bounced") {
          await fire("email.bounced", 3000, {
            bounce: {
              type: "Permanent",
              subType: "General",
              message: "550 5.1.1 The email account does not exist",
            },
          });
          continue;
        }
        await fire("email.delivered", 2500 + Math.round(rand() * 2000));
        if (outcome.includes("opened")) await fire("email.opened", 12 * 60_000);
        if (outcome.includes("clicked"))
          await fire("email.clicked", 14 * 60_000, {
            click: { link: "https://example.com/welcome" },
          });
      }

      // A scheduled email and a trashed thread.
      await sendEmail(owner, {
        senderId,
        to: ["press@example.org"],
        subject: "Launch announcement (scheduled)",
        text: "Embargoed until tomorrow morning.",
        scheduledAt: new Date(Date.now() + DAY + 9 * HOUR),
      });
      const readByOwner = inbox.items[inbox.items.length - 1];
      if (readByOwner) await markThreadRead(owner, readByOwner.id);
      const trashed = inbox.items[inbox.items.length - 2];
      if (trashed) await trashItems(owner, { threadIds: [trashed.id] });
    }

    // ~30 days of metrics so Overview and Insights have shape (synthetic, on top of real events).
    const usageDaily: Record<string, number> = {};
    for (const conn of healthy) {
      const base = 30 * ws.scale * (conn === healthy[0] ? 1 : 0.6);
      for (let d = 30; d >= 1; d--) {
        const day = new Date(Date.now() - d * DAY);
        const weekend = [0, 6].includes(day.getUTCDay());
        const sent = Math.round(base * (weekend ? 0.45 : 1) * (0.75 + rand() * 0.5));
        const bounced = Math.max(0, Math.round(sent * (0.004 + rand() * 0.012)));
        const delivered = sent - bounced - (rand() < 0.15 ? 1 : 0);
        const opened = Math.round(delivered * (0.36 + rand() * 0.18));
        const clicked = Math.round(opened * (0.15 + rand() * 0.1));
        const complained = d % 11 === 0 ? 1 : 0;
        const received = Math.round((weekend ? 1 : 4) * ws.scale * (0.5 + rand()));
        const parts = [
          [9, 0.3],
          [13, 0.45],
          [17, 0.25],
        ] as const;
        for (const [hour, share] of parts) {
          const at = new Date(
            Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, 10),
          );
          await incrementRollups(
            { orgId, connectionId: conn.oid, domainId: conn.domainId, projectId: conn.projectId },
            {
              at,
              stream: "transactional",
              counters: {
                sent: Math.round(sent * share),
                delivered: Math.round(delivered * share),
                bounced_hard: hour === 13 ? bounced : 0,
                complained: hour === 17 ? complained : 0,
                opened_unique: Math.round(opened * share),
                opened_total: Math.round(opened * share * 1.3),
                clicked_unique: Math.round(clicked * share),
                clicked_total: Math.round(clicked * share * 1.2),
                received: hour === 9 ? received : 0,
              },
              latencyMs: Math.round(400 + rand() * rand() * 9000),
            },
          );
        }
        const key = dayKey(day);
        usageDaily[key] = (usageDaily[key] ?? 0) + sent + received;
      }
    }

    // Alerts: a bounce-rate rule with an open incident (and the bounce spike behind it).
    if (ws.alerts && healthy[0]) {
      const conn = healthy[0];
      const rule = await createAlertRule(owner, {
        name: "Bounce rate above 5%",
        kind: "bounce_rate",
        scope: { connectionIds: [conn.id], projectIds: [], domainIds: [] },
        condition: { operator: "gt", threshold: 5, windowMinutes: 180, minVolume: 50 },
        channels: { inApp: true, emailMembers: true, email: [] },
        enabled: true,
      });
      await createAlertRule(owner, {
        name: "Any spam complaint",
        kind: "complaint_any",
        condition: { operator: "gt", threshold: 0, windowMinutes: 1440, minVolume: 0 },
        channels: { inApp: true, emailMembers: false, email: [] },
        enabled: true,
      });
      await incrementRollups(
        { orgId, connectionId: conn.oid, domainId: conn.domainId, projectId: conn.projectId },
        {
          at: new Date(Date.now() - HOUR),
          stream: "transactional",
          counters: { sent: 120, delivered: 104, bounced_hard: 16 },
        },
      );
      const incident = await models.AlertIncidentModel.create({
        orgId,
        ruleId: new Types.ObjectId(rule.id),
        dedupKey: `${rule.id}:${conn.id}`,
        active: true,
        status: "open",
        title: "Bounce rate is 13.3% on the last 3 hours",
        summary: "16 of 120 emails bounced. Most went to addresses that do not exist.",
        ruleName: rule.name,
        kind: "bounce_rate",
        openedAt: new Date(Date.now() - 50 * 60_000),
        observedValue: 13.3,
        lastEvaluatedAt: new Date(),
        context: { connectionId: conn.id, threshold: 5, windowMinutes: 180 },
      });
      await createNotifications({
        orgId,
        type: "incident_opened",
        title: incident.title,
        body: incident.summary,
        link: `/${ws.slug}/alerts`,
        refs: { incidentId: incident._id, connectionId: conn.oid },
        audience: { permission: "alertRule:read" },
        dedupKey: `incident_opened:${incident._id}`,
      });
      await createNotifications({
        orgId,
        type: "sync_finished",
        title: "Initial sync finished",
        body: "Your domains, contacts and templates are up to date.",
        link: `/${ws.slug}/settings/connections`,
        refs: { connectionId: conn.oid },
        audience: { permission: "connection:read" },
        dedupKey: `seed:sync:${conn.id}`,
      });
    }

    // Tracked-email usage for the billing period (the real events above already counted).
    const settings = await models.OrgSettingsModel.findOne({ orgId }).lean();
    if (settings && healthy.length > 0) {
      const monthStart = settings.billingPeriod.start.getTime();
      const inc: Record<string, number> = {};
      let total = 0;
      for (const [day, n] of Object.entries(usageDaily)) {
        if (new Date(`${day}T00:00:00Z`).getTime() < monthStart) continue;
        inc[`daily.${day}.transactional`] = n;
        total += n;
      }
      if (total > 0) {
        inc["emailsTracked.transactional"] = total;
        await models.UsagePeriodModel.updateOne(
          { orgId, periodStart: settings.billingPeriod.start },
          {
            $setOnInsert: {
              periodEnd: settings.billingPeriod.end,
              plan: ws.plan,
              allowance: (await import("@/lib/billing/plans")).PLAN_CATALOG[ws.plan].limits
                .emailsTrackedPerMonth,
            },
            $inc: inc,
          },
          { upsert: true },
        );
      }
    }

    await meta.updateOne(
      { _id: `workspace:${ws.slug}` },
      { $set: { at: new Date() } },
      { upsert: true },
    );
  }

  /* ---- summary ---- */

  const rows = credentials.map((c) => [c.email, c.role, c.workspace, c.plan]);
  const header = ["Email", "Role", "Workspace", "Plan"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (r: string[]) => r.map((v, i) => v.padEnd(widths[i]!)).join("  ");
  console.log(`\nSeeded. Sign in at your dev server with the password  ${SEED_PASSWORD}\n`);
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
  console.log(`\nPlatform admin panel: /admin (sign in as ${ADMIN.email}).`);
  console.log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);

  await disconnectDb();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
