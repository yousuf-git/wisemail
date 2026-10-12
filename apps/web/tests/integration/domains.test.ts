import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { startTestDb } from "./helpers";
import { seedTeam } from "./alerts-helpers";
import { ctxFor, loadMail, seedOrg, type Mail, type Seed } from "./mail-helpers";

type Resolution =
  { status: "unauthenticated" } | { status: "not_member" } | { status: "ok"; ctx: unknown };
const dal = vi.hoisted(() => ({
  resolve: ((): Resolution => ({ status: "unauthenticated" })) as () => Resolution,
}));
vi.mock("@/lib/dal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dal")>()),
  getOrgContext: async () => dal.resolve(),
}));

let stop: () => Promise<void>;
let m: Mail;
let domains: typeof import("@/lib/services/domains");
let dnsService: typeof import("@/lib/services/dns-check");
let keys: typeof import("@/lib/services/api-keys");
let evaluation: typeof import("@/lib/services/alert-evaluation");
let alerts: typeof import("@/lib/services/alerts");
let domainActions: typeof import("@/app/(app)/[orgSlug]/domains/actions");
let keyActions: typeof import("@/app/(app)/[orgSlug]/api-keys/actions");
let dnsFn: typeof import("@/inngest/functions/dns-check");
type Role = import("@/lib/auth/permissions").Role;
type DnsResolver = import("@/lib/dns/resolver").DnsResolver;

beforeAll(async () => {
  ({ stop } = await startTestDb("domains"));
  m = await loadMail();
  domains = await import("@/lib/services/domains");
  dnsService = await import("@/lib/services/dns-check");
  keys = await import("@/lib/services/api-keys");
  evaluation = await import("@/lib/services/alert-evaluation");
  alerts = await import("@/lib/services/alerts");
  domainActions = await import("@/app/(app)/[orgSlug]/domains/actions");
  keyActions = await import("@/app/(app)/[orgSlug]/api-keys/actions");
  dnsFn = await import("@/inngest/functions/dns-check");
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

beforeEach(() => {
  m.jobs.resetSentJobs();
});

async function setup() {
  const seed = await seedOrg(m);
  const team = await seedTeam(m, seed);
  const as = (role: Role, options: { projectScope?: string[] | null } = {}) =>
    ctxFor(m, seed.orgId, role, { userId: team.people[role]?.userId, ...options });
  return { seed, team, as };
}

const forbidden = { code: "forbidden" };

/** Resolver that answers what a healthy domain publishes; `zone` overrides per test. */
function resolverFor(zone: {
  txt?: Record<string, string[]>;
  mx?: Record<string, { exchange: string; priority: number }[]>;
}): DnsResolver & { calls: number } {
  const r = {
    calls: 0,
    resolveTxt: async (name: string) => {
      r.calls++;
      return zone.txt?.[name] ?? [];
    },
    resolveMx: async (name: string) => {
      r.calls++;
      return zone.mx?.[name] ?? [];
    },
    resolveCname: async () => {
      r.calls++;
      return [];
    },
  };
  return r;
}

/** Gives the seeded mirror the records Resend would list, and returns a resolver that matches them. */
async function withRecords(seed: Seed) {
  const name = seed.domain.name;
  await m.models.DomainModel.updateOne(
    { _id: seed.domain._id },
    {
      $set: {
        records: [
          {
            record: "SPF",
            type: "TXT",
            name: `send.${name}`,
            value: "v=spf1 include:amazonses.com ~all",
            status: "verified",
          },
          {
            record: "DKIM",
            type: "TXT",
            name: `resend._domainkey.${name}`,
            value: "p=MIGfMA0GCSqGSIb3DQEB",
            status: "verified",
          },
        ],
        receiving: { enabled: false, mxVerified: false },
      },
    },
  );
  const zone = {
    txt: {
      [`send.${name}`]: ["v=spf1 include:amazonses.com ~all"],
      [`resend._domainkey.${name}`]: ["p=MIGfMA0GCSqGSIb3DQEB"],
      [`_dmarc.${name}`]: ["v=DMARC1; p=none"],
    },
  };
  return { zone, resolver: resolverFor(zone) };
}

describe("listing and scope", () => {
  it("lists domains across connections and hides other projects from scoped members", async () => {
    const { seed, as } = await setup();
    const project = await m.models.ProjectModel.create({
      orgId: seed.orgId,
      name: "Store",
      slug: "store",
      color: "accent",
    });
    await m.models.DomainModel.updateOne({ _id: seed.domain._id }, { projectId: project._id });

    const all = await domains.listDomains(as("developer"));
    expect(all.map((d) => d.name)).toEqual([seed.domain.name]);
    expect(all[0]).toMatchObject({ projectName: "Store", senderCount: 1 });

    const other = await domains.listDomains(
      as("developer", { projectScope: [new Types.ObjectId().toHexString()] }),
    );
    expect(other).toEqual([]);
    const mine = await domains.listDomains(
      as("developer", { projectScope: [project._id.toHexString()] }),
    );
    expect(mine).toHaveLength(1);
    await expect(
      domains.getDomain(
        as("developer", { projectScope: [new Types.ObjectId().toHexString()] }),
        seed.domain._id.toHexString(),
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("support has no access to domains", async () => {
    const { as } = await setup();
    await expect(domains.listDomains(as("support"))).rejects.toMatchObject(forbidden);
  });
});

describe("tracking", () => {
  it("developers toggle tracking in Resend and the mirror, with an audit entry and a fresh checklist", async () => {
    const { seed, as } = await setup();
    const id = seed.domain._id.toHexString();
    const dto = await domains.setDomainTracking(as("developer"), {
      domainId: id,
      openTracking: false,
    });
    expect(dto).toMatchObject({ openTracking: false, clickTracking: true });

    const adapter = new m.fake.FakeResendAdapter(seed.key);
    expect((await adapter.getDomain(seed.domain.resendId)).openTracking).toBe(false);
    const stored = await m.models.DomainModel.findById(seed.domain._id).lean();
    expect(stored?.openTracking).toBe(false);
    const audit = await m.models.AuditLogModel.findOne({
      orgId: seed.orgId,
      action: "domain.tracking_updated",
    }).lean();
    expect(audit?.changes?.after).toMatchObject({ openTracking: false });
    const conn = await m.models.ConnectionModel.findById(seed.connectionId).lean();
    expect(conn?.checklist?.find((i) => i.key === "open_tracking")?.status).not.toBe("ok");

    await domains.setDomainTracking(as("developer"), { domainId: id, openTracking: true });
    const again = await m.models.ConnectionModel.findById(seed.connectionId).lean();
    expect(again?.checklist?.find((i) => i.key === "open_tracking")?.status).toBe("ok");
  });

  it("viewers and support cannot change tracking (service and action)", async () => {
    const { seed, as } = await setup();
    const id = seed.domain._id.toHexString();
    await expect(
      domains.setDomainTracking(as("viewer"), { domainId: id, openTracking: false }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      domains.setDomainTracking(as("support"), { domainId: id, openTracking: false }),
    ).rejects.toMatchObject(forbidden);

    dal.resolve = () => ({ status: "ok", ctx: as("viewer") });
    const result = await domainActions.setDomainTrackingAction("org", {
      domainId: id,
      openTracking: false,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect((await m.models.DomainModel.findById(seed.domain._id).lean())?.openTracking).toBe(true);
  });

  it("refuses read-only connections", async () => {
    const { seed, as } = await setup();
    await m.models.ConnectionModel.updateOne({ _id: seed.connectionId }, { status: "read_only" });
    await expect(
      domains.setDomainTracking(as("admin"), {
        domainId: seed.domain._id.toHexString(),
        openTracking: false,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("create, verify and delete", () => {
  it("only Owners and Admins add domains; the result carries the DNS records", async () => {
    const { seed, as } = await setup();
    const input = {
      connectionId: seed.connectionId.toHexString(),
      name: "Send.Newdomain.Example",
      region: "eu-west-1" as const,
    };
    await expect(domains.createDomain(as("developer"), input)).rejects.toMatchObject(forbidden);
    await expect(domains.createDomain(as("viewer"), input)).rejects.toMatchObject(forbidden);

    const created = await domains.createDomain(as("admin"), {
      ...input,
      name: "send.newdomain.example",
    });
    expect(created).toMatchObject({
      name: "send.newdomain.example",
      status: "not_started",
      region: "eu-west-1",
    });
    expect(created.records.length).toBeGreaterThan(0);
    expect(created.records.every((r) => r.status === "not_started")).toBe(true);
    expect(await m.models.DomainModel.countDocuments({ orgId: seed.orgId })).toBe(2);
    expect(
      await m.models.AuditLogModel.countDocuments({ orgId: seed.orgId, action: "domain.created" }),
    ).toBe(1);

    await expect(
      domains.createDomain(as("admin"), { ...input, name: "send.newdomain.example" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      domains.createDomain(as("admin"), { ...input, name: "https://nope" }),
    ).rejects.toThrow();
  });

  it("Resend refusing a duplicate name comes back as a field error", async () => {
    const { seed, as } = await setup();
    // Already in Resend (fake team domain #2) but not mirrored here.
    const teamSlug = seed.domain.name.split(".")[0];
    const error = await domains
      .createDomain(as("admin"), {
        connectionId: seed.connectionId.toHexString(),
        name: `mail.${teamSlug}.example.com`,
      })
      .catch((e) => e);
    expect(error).toMatchObject({
      code: "validation",
      fieldErrors: { name: [expect.stringContaining("already")] },
    });
  });

  it("verify: Owners and Admins only; refreshes status, records and senders", async () => {
    const { seed, as } = await setup();
    const created = await domains.createDomain(as("admin"), {
      connectionId: seed.connectionId.toHexString(),
      name: "verify-me.example.org",
    });
    await expect(
      domains.verifyDomain(as("developer"), { domainId: created.id }),
    ).rejects.toMatchObject(forbidden);

    const verified = await domains.verifyDomain(as("admin"), { domainId: created.id });
    expect(verified.status).toBe("verified");
    expect(verified.records.every((r) => r.status === "verified")).toBe(true);

    const bad = await domains.createDomain(as("admin"), {
      connectionId: seed.connectionId.toHexString(),
      name: "unverifiable.example.org",
    });
    expect((await domains.verifyDomain(as("admin"), { domainId: bad.id })).status).toBe("failed");
  });

  it("delete needs the typed name, removes it in Resend, turns senders off and tells members", async () => {
    const { seed, team, as } = await setup();
    const id = seed.domain._id.toHexString();
    await expect(
      domains.deleteDomain(as("developer"), { domainId: id, confirmName: seed.domain.name }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      domains.deleteDomain(as("admin"), { domainId: id, confirmName: "wrong.example" }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(await m.models.DomainModel.countDocuments({ _id: seed.domain._id })).toBe(1);

    const result = await domains.deleteDomain(as("admin"), {
      domainId: id,
      confirmName: seed.domain.name.toUpperCase(),
    });
    expect(result).toMatchObject({ name: seed.domain.name, sendersAffected: 1 });

    const adapter = new m.fake.FakeResendAdapter(seed.key);
    await expect(adapter.getDomain(seed.domain.resendId)).rejects.toMatchObject({
      code: "resend_not_found",
    });
    expect(await m.models.DomainModel.countDocuments({ _id: seed.domain._id })).toBe(0);
    const sender = await m.models.SenderModel.findById(seed.sender._id).lean();
    expect(sender).toMatchObject({
      status: "domain_unverified",
      statusReason: "domain_deleted_in_resend",
    });
    expect(
      await m.models.AuditLogModel.countDocuments({ orgId: seed.orgId, action: "domain.deleted" }),
    ).toBe(1);
    const note = await m.models.NotificationModel.findOne({
      orgId: seed.orgId,
      userId: team.people.admin!.userId,
      type: "domain_changed",
    }).lean();
    expect(note?.title).toContain("was deleted");
    expect(note?.body).toContain("1 sender");
  });

  it("delete is idempotent when Resend already lost the domain", async () => {
    const { seed, as } = await setup();
    const adapter = new m.fake.FakeResendAdapter(seed.key);
    await adapter.removeDomain(seed.domain.resendId);
    await expect(
      domains.deleteDomain(as("owner"), {
        domainId: seed.domain._id.toHexString(),
        confirmName: seed.domain.name,
      }),
    ).resolves.toMatchObject({ name: seed.domain.name });
  });
});

describe("project assignment", () => {
  it("needs project:update and a project of this org", async () => {
    const { seed, as } = await setup();
    const project = await m.models.ProjectModel.create({
      orgId: seed.orgId,
      name: "Blog",
      slug: "blog",
      color: "coral",
    });
    const id = seed.domain._id.toHexString();
    await expect(
      domains.assignDomainProject(as("developer"), {
        domainId: id,
        projectId: project._id.toHexString(),
      }),
    ).rejects.toMatchObject(forbidden);

    const dto = await domains.assignDomainProject(as("admin"), {
      domainId: id,
      projectId: project._id.toHexString(),
    });
    expect(dto).toMatchObject({ projectId: project._id.toHexString(), projectName: "Blog" });
    expect(
      await m.models.AuditLogModel.countDocuments({
        orgId: seed.orgId,
        action: "domain.project_changed",
      }),
    ).toBe(1);

    await expect(
      domains.assignDomainProject(as("admin"), {
        domainId: id,
        projectId: new Types.ObjectId().toHexString(),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    const cleared = await domains.assignDomainProject(as("admin"), {
      domainId: id,
      projectId: null,
    });
    expect(cleared.projectId).toBeNull();
  });
});

describe("DNS check", () => {
  it("stores the verdicts, feeds the checklist's DMARC item and is rate limited", async () => {
    const { seed, as } = await setup();
    const { resolver } = await withRecords(seed);
    const id = seed.domain._id.toHexString();

    const dto = await dnsService.checkDnsNow(as("developer"), { domainId: id }, { resolver });
    expect(dto).toMatchObject({ spf: "pass", dkim: "pass", dmarc: "pass", mx: "skipped" });
    const stored = await m.models.DomainModel.findById(seed.domain._id).lean();
    expect(stored?.dnsCheck).toMatchObject({ spf: "pass", dkim: "pass", dmarc: "pass" });
    const conn = await m.models.ConnectionModel.findById(seed.connectionId).lean();
    expect(conn?.checklist?.find((i) => i.key === "dmarc")?.status).toBe("ok");

    const calls = resolver.calls;
    await dnsService.checkDnsNow(as("developer"), { domainId: id }, { resolver });
    expect(resolver.calls).toBe(calls); // cooldown: stored result, no lookups

    await expect(
      dnsService.checkDnsNow(as("viewer"), { domainId: id }, { resolver }),
    ).rejects.toMatchObject(forbidden);
  });

  it("a missing DMARC record fails the checklist item", async () => {
    const { seed } = await setup();
    const { zone } = await withRecords(seed);
    const noDmarc = resolverFor({
      ...zone,
      txt: { ...zone.txt, [`_dmarc.${seed.domain.name}`]: [] },
    });
    await dnsService.checkDomain(seed.orgId, seed.domain._id, { resolver: noDmarc });
    const conn = await m.models.ConnectionModel.findById(seed.connectionId).lean();
    expect(conn?.checklist?.find((i) => i.key === "dmarc")?.status).toBe("fail");
  });

  it("DNS drift opens a domain_status incident and closes it when the records return", async () => {
    const { seed, team, as } = await setup();
    const { zone } = await withRecords(seed);
    const owner = as("owner");
    await alerts.createAlertRule(owner, {
      name: "Domains",
      kind: "domain_status",
      condition: { operator: "gt", threshold: 0, windowMinutes: 0, minVolume: 0 },
    });

    await dnsService.checkDomain(seed.orgId, seed.domain._id, { resolver: resolverFor(zone) });
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 0 });

    // DKIM disappears from DNS while Resend still says verified.
    const drifted = resolverFor({
      ...zone,
      txt: { ...zone.txt, [`resend._domainkey.${seed.domain.name}`]: [] },
    });
    await dnsService.checkDomain(seed.orgId, seed.domain._id, { resolver: drifted });
    expect(m.jobs.sentJobs.some((j) => j.name === "alerts/evaluate.requested")).toBe(true);
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 1 });
    const incident = await m.models.AlertIncidentModel.findOne({
      orgId: seed.orgId,
      active: true,
    }).lean();
    expect(incident?.title).toContain("lost DNS records");
    expect(incident?.summary).toContain("DKIM");
    expect(
      await m.models.NotificationModel.countDocuments({
        orgId: seed.orgId,
        userId: team.people.owner!.userId,
      }),
    ).toBeGreaterThan(0);

    await dnsService.checkDomain(seed.orgId, seed.domain._id, { resolver: resolverFor(zone) });
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({
      opened: 0,
      resolved: 1,
    });
  });

  it("a failed lookup (unknown) does not raise drift", async () => {
    const { seed, as } = await setup();
    await withRecords(seed);
    await alerts.createAlertRule(as("owner"), {
      name: "Domains",
      kind: "domain_status",
      condition: { operator: "gt", threshold: 0, windowMinutes: 0, minVolume: 0 },
    });
    const flaky: DnsResolver = {
      resolveTxt: async () => {
        throw new (await import("@/lib/dns/resolver")).DnsLookupError("timeout", "t");
      },
      resolveMx: async () => [],
      resolveCname: async () => [],
    };
    await dnsService.checkDomain(seed.orgId, seed.domain._id, { resolver: flaky });
    const stored = await m.models.DomainModel.findById(seed.domain._id).lean();
    expect(stored?.dnsCheck).toMatchObject({ spf: "unknown", dkim: "unknown" });
    expect(await evaluation.evaluateOrgAlerts(seed.orgId)).toMatchObject({ opened: 0 });
  });

  it("the scheduled job lists domains of usable connections only", async () => {
    const { seed } = await setup();
    const other = await seedOrg(m);
    await m.models.ConnectionModel.updateOne({ _id: other.connectionId }, { status: "read_only" });
    const targets = await dnsService.listDnsCheckTargets();
    const ids = targets.map((t) => t.domainId);
    expect(ids).toContain(seed.domain._id.toHexString());
    expect(ids).not.toContain(other.domain._id.toHexString());
    expect(await dnsService.listDnsCheckTargets({ orgId: seed.orgId.toHexString() })).toHaveLength(
      1,
    );
    expect(dnsFn.dnsCheckDaily).toBeDefined();
    expect(dnsFn.dnsCheckOnDemand).toBeDefined();
  });
});

describe("API keys", () => {
  const conn = (seed: Seed) => seed.connectionId.toHexString();

  it("developers create sending keys only; the secret is returned once and never stored", async () => {
    const { seed, as } = await setup();
    await expect(
      keys.createApiKey(as("developer"), {
        connectionId: conn(seed),
        name: "Full key",
        permission: "full_access",
      }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      keys.createApiKey(as("support"), {
        connectionId: conn(seed),
        name: "Nope",
        permission: "sending_access",
      }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      keys.createApiKey(as("viewer"), {
        connectionId: conn(seed),
        name: "Nope",
        permission: "sending_access",
      }),
    ).rejects.toMatchObject(forbidden);

    const created = await keys.createApiKey(as("developer"), {
      connectionId: conn(seed),
      name: "Storefront",
      permission: "sending_access",
      domainId: seed.domain._id.toHexString(),
    });
    expect(created.secret).toMatch(/^re_/);
    expect(created.key).toMatchObject({
      name: "Storefront",
      permission: "sending_access",
      domainName: seed.domain.name,
      createdViaApp: true,
    });
    expect(created.key).not.toHaveProperty("secret");

    // The secret is in no collection: mirror, audit log, realtime events, connection.
    for (const model of [
      m.models.ApiKeyModel,
      m.models.AuditLogModel,
      m.models.RealtimeEventModel,
      m.models.ConnectionModel,
    ]) {
      const docs = await (
        model as unknown as { find: (f: object) => { lean: () => Promise<unknown[]> } }
      )
        .find({})
        .lean();
      expect(JSON.stringify(docs)).not.toContain(created.secret);
    }
    // And no later read returns it.
    const listed = await keys.listApiKeys(as("developer"));
    expect(JSON.stringify(listed)).not.toContain(created.secret);
    expect(listed.find((k) => k.name === "Storefront")).toMatchObject({
      permission: "sending_access",
    });
    expect(
      await m.models.AuditLogModel.countDocuments({ orgId: seed.orgId, action: "api_key.created" }),
    ).toBe(1);
  });

  it("admins create full-access keys; full access can't be limited to a domain", async () => {
    const { seed, as } = await setup();
    const full = await keys.createApiKey(as("admin"), {
      connectionId: conn(seed),
      name: "Ops",
      permission: "full_access",
    });
    expect(full.key.permission).toBe("full_access");
    await expect(
      keys.createApiKey(as("admin"), {
        connectionId: conn(seed),
        name: "Ops 2",
        permission: "full_access",
        domainId: seed.domain._id.toHexString(),
      }),
    ).rejects.toThrow();
  });

  it("a domain from another connection is refused, and scoped members must pick a domain", async () => {
    const { seed, as } = await setup();
    const other = await seedOrg(m);
    await expect(
      keys.createApiKey(as("admin"), {
        connectionId: conn(seed),
        name: "Cross",
        permission: "sending_access",
        domainId: other.domain._id.toHexString(),
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      keys.createApiKey(as("developer", { projectScope: [new Types.ObjectId().toHexString()] }), {
        connectionId: conn(seed),
        name: "Scoped",
        permission: "sending_access",
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("the action layer refuses a developer's full-access request", async () => {
    const { seed, as } = await setup();
    dal.resolve = () => ({ status: "ok", ctx: as("developer") });
    const denied = await keyActions.createApiKeyAction("org", {
      connectionId: conn(seed),
      name: "Big",
      permission: "full_access",
    });
    expect(denied).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const allowed = await keyActions.createApiKeyAction("org", {
      connectionId: conn(seed),
      name: "Small",
      permission: "sending_access",
    });
    expect(allowed).toMatchObject({ ok: true });
    const removed = await keyActions.deleteApiKeyAction("org", {
      apiKeyId: new Types.ObjectId().toHexString(),
      confirmName: "x",
    });
    expect(removed).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });

  it("delete: Admin+ only, typed name, and never the key Wisemail uses", async () => {
    const { seed, as } = await setup();
    const adapter = new m.fake.FakeResendAdapter(seed.key);
    await m.models.ApiKeyModel.create([
      {
        orgId: seed.orgId,
        connectionId: seed.connectionId,
        resendId: adapter.ownApiKeyId()!,
        name: "Wisemail",
        syncedAt: new Date(),
      },
    ]);
    const created = await keys.createApiKey(as("admin"), {
      connectionId: conn(seed),
      name: "Old key",
      permission: "sending_access",
    });

    await expect(
      keys.deleteApiKey(as("developer"), { apiKeyId: created.key.id, confirmName: "Old key" }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      keys.deleteApiKey(as("admin"), { apiKeyId: created.key.id, confirmName: "wrong" }),
    ).rejects.toMatchObject({ code: "validation" });

    const own = await m.models.ApiKeyModel.findOne({ orgId: seed.orgId, name: "Wisemail" }).lean();
    const blocked = await keys
      .deleteApiKey(as("owner"), { apiKeyId: own!._id.toHexString(), confirmName: "Wisemail" })
      .catch((e) => e);
    expect(blocked).toMatchObject({ code: "conflict" });
    expect(blocked.message).toContain("uses this key");
    expect(await m.models.ApiKeyModel.countDocuments({ _id: own!._id })).toBe(1);
    const listed = await keys.listApiKeys(as("admin"));
    expect(listed.find((k) => k.name === "Wisemail")).toMatchObject({
      inUse: "exact",
      connectionKeyLast4: seed.key.slice(-4),
    });

    const done = await keys.deleteApiKey(as("admin"), {
      apiKeyId: created.key.id,
      confirmName: "Old key",
    });
    expect(done.name).toBe("Old key");
    expect(
      await m.models.ApiKeyModel.countDocuments({ _id: new Types.ObjectId(created.key.id) }),
    ).toBe(0);
    const remaining = await adapter.listApiKeys({ limit: 100 });
    expect(remaining.data.some((k) => k.name === "Old key")).toBe(false);
    expect(
      await m.models.AuditLogModel.countDocuments({ orgId: seed.orgId, action: "api_key.deleted" }),
    ).toBe(1);
  });

  it("a key named after Wisemail needs an acknowledgement when the adapter can't tell", async () => {
    const { seed, as } = await setup();
    const adapter = new m.fake.FakeResendAdapter(seed.key);
    const created = await adapter.createApiKey({
      name: "Wisemail prod",
      permission: "full_access",
    });
    const doc = await m.models.ApiKeyModel.create({
      orgId: seed.orgId,
      connectionId: seed.connectionId,
      resendId: created.id,
      name: "Wisemail prod",
      syncedAt: new Date(),
    });
    // Live Resend can't say which key a request used: emulate an adapter without that knowledge.
    const live = Object.create(adapter) as typeof adapter;
    (live as { ownApiKeyId: () => string | null }).ownApiKeyId = () => null;
    const id = doc._id.toHexString();

    const refused = await keys
      .deleteApiKey(as("admin"), { apiKeyId: id, confirmName: "Wisemail prod" }, { adapter: live })
      .catch((e) => e);
    expect(refused).toMatchObject({ code: "conflict" });
    expect(refused.message).toContain("may be the one Wisemail uses");
    await expect(
      keys.deleteApiKey(
        as("admin"),
        { apiKeyId: id, confirmName: "Wisemail prod", acknowledgeInUse: true },
        { adapter: live },
      ),
    ).resolves.toMatchObject({ name: "Wisemail prod" });
  });

  it("flags full-access keys older than 90 days", async () => {
    const { seed, as } = await setup();
    const created = await keys.createApiKey(as("owner"), {
      connectionId: conn(seed),
      name: "Ancient",
      permission: "full_access",
    });
    await m.models.ApiKeyModel.updateOne(
      { _id: new Types.ObjectId(created.key.id) },
      { resendCreatedAt: new Date(Date.now() - 120 * 86_400_000) },
    );
    const listed = await keys.listApiKeys(as("owner"));
    expect(listed.find((k) => k.name === "Ancient")?.stale).toBe(true);
  });

  it("scoped members only see keys limited to their domains", async () => {
    const { seed, as } = await setup();
    const project = await m.models.ProjectModel.create({
      orgId: seed.orgId,
      name: "P",
      slug: "p",
      color: "accent",
    });
    await m.models.DomainModel.updateOne({ _id: seed.domain._id }, { projectId: project._id });
    await keys.createApiKey(as("admin"), {
      connectionId: conn(seed),
      name: "Unlimited",
      permission: "sending_access",
    });
    await keys.createApiKey(as("admin"), {
      connectionId: conn(seed),
      name: "Limited",
      permission: "sending_access",
      domainId: seed.domain._id.toHexString(),
    });
    const scoped = await keys.listApiKeys(
      as("developer", { projectScope: [project._id.toHexString()] }),
    );
    expect(scoped.map((k) => k.name)).toEqual(["Limited"]);
    const stranger = await keys.listApiKeys(
      as("developer", { projectScope: [new Types.ObjectId().toHexString()] }),
    );
    expect(stranger).toEqual([]);
  });
});
