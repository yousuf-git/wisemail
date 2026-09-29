import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { signUpVerified, startTestDb, uniqueEmail } from "./helpers";

const headerState = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => headerState.current,
  cookies: async () => ({ set() {}, get() {}, delete() {}, getAll: () => [] }),
}));

let stop: () => Promise<void>;
let auth: typeof import("@/lib/auth/server").auth;
let models: typeof import("@/lib/db/models");
let dal: typeof import("@/lib/dal");
let svc: typeof import("@/lib/services/connections");
let actions: typeof import("@/app/(app)/[orgSlug]/settings/connections/actions");
let fake: typeof import("@/lib/resend/fake-adapter");
let jobs: typeof import("@/lib/jobs/send");
let envelope: typeof import("@/lib/crypto/envelope");
let events: typeof import("@/lib/resend/events");
let connect: typeof import("@/lib/db/connect");

beforeAll(async () => {
  ({ stop } = await startTestDb("connections"));
  connect = await import("@/lib/db/connect");
  auth = (await import("@/lib/auth/server")).auth;
  models = await import("@/lib/db/models");
  dal = await import("@/lib/dal");
  svc = await import("@/lib/services/connections");
  actions = await import("@/app/(app)/[orgSlug]/settings/connections/actions");
  fake = await import("@/lib/resend/fake-adapter");
  jobs = await import("@/lib/jobs/send");
  envelope = await import("@/lib/crypto/envelope");
  events = await import("@/lib/resend/events");
  await connect.connectDb();
  await models.ConnectionModel.init();
}, 120_000);

afterAll(async () => {
  await connect?.disconnectDb();
  await stop?.();
});

beforeEach(() => {
  fake.resetFakeResend();
  jobs.resetSentJobs();
});

type User = { id: string; headers: Headers };
let orgCounter = 0;

async function signUp(name: string): Promise<User> {
  return signUpVerified(auth, { name, email: uniqueEmail(name.toLowerCase()) });
}

/** An org owned by a fresh user, on `plan`, plus helpers to add members and get contexts. */
async function newOrg(plan: "free" | "pro" = "pro") {
  const owner = await signUp("Owner");
  const slug = `conn-org-${++orgCounter}`;
  const org = await auth.api.createOrganization({
    headers: owner.headers,
    body: { name: slug, slug },
  });
  await models.OrgSettingsModel.updateOne({ orgId: new Types.ObjectId(org.id) }, { plan });
  const ctxOf = async (user: User) => {
    headerState.current = user.headers;
    const result = await dal.getOrgContext(slug);
    if (result.status !== "ok") throw new Error(`no context: ${result.status}`);
    return result.ctx;
  };
  const addMember = async (role: "owner" | "admin" | "developer" | "support" | "viewer") => {
    const user = await signUp(role);
    await auth.api.addMember({ body: { userId: user.id, organizationId: org.id, role } });
    return user;
  };
  return {
    org,
    slug,
    owner,
    ctx: () => ctxOf(owner),
    ctxOf,
    addMember,
    orgId: new Types.ObjectId(org.id),
  };
}

const rawDoc = (id: string) => models.ConnectionModel.findById(id).lean();

describe("addConnection", () => {
  it("validates, encrypts, registers the webhook and goes active", async () => {
    const t = await newOrg();
    const ctx = await t.ctx();
    const dto = await svc.addConnection(ctx, {
      name: "Personal",
      apiKey: "re_happy_full_abcd1234",
    });

    expect(dto).toMatchObject({
      name: "Personal",
      status: "active",
      statusReason: null,
      apiKeyLast4: "1234",
      webhookRegistered: true,
      lastEventAt: null,
    });
    // DTO carries no secrets.
    expect(JSON.stringify(dto)).not.toMatch(/ciphertext|wrappedDek|whsec_|re_happy/);

    const doc = (await rawDoc(dto.id))!;
    expect(doc.apiKey!.ciphertext).toBeTruthy();
    expect(JSON.stringify(doc)).not.toContain("re_happy_full_abcd1234");
    expect(envelope.decryptSecret(doc.apiKey!, { aad: `connections:${dto.id}:apiKey` })).toBe(
      "re_happy_full_abcd1234",
    );
    expect(doc.resendTeamFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.createdBy.toHexString()).toBe(ctx.user.id);

    // Webhook registered at our ingest URL for all event types, secret stored encrypted.
    const team = fake.fakeStore().teams.get("happy")!;
    const [hook] = [...team.webhooks.values()];
    expect(hook!.endpoint).toBe(`http://localhost:3000/api/ingest/resend/${dto.id}`);
    expect(hook!.events).toEqual([...events.SUPPORTED_EVENT_TYPES]);
    expect(doc.webhook).toMatchObject({ resendId: hook!.id });
    expect(doc.webhook!.events).toHaveLength(events.SUPPORTED_EVENT_TYPES.length);
    expect(await svc.readWebhookSigningSecret(dto.id)).toBe(hook!.signingSecret);

    // Audit, realtime, initial sync job.
    const audit = await models.AuditLogModel.find({
      orgId: t.orgId,
      "target.type": "connection",
    }).lean();
    expect(audit.map((a) => a.action).sort()).toEqual([
      "connection.created",
      "connection.webhook_registered",
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/re_happy|whsec_/);
    expect(
      await models.RealtimeEventModel.countDocuments({ orgId: t.orgId }),
    ).toBeGreaterThanOrEqual(2);
    expect(jobs.sentJobs).toEqual([
      {
        name: "connection/sync.requested",
        data: { connectionId: dto.id, orgId: t.org.id, trigger: "initial" },
      },
    ]);
  });

  it("rejects a sending-only key with the product wording and creates nothing", async () => {
    const t = await newOrg();
    await expect(
      svc.addConnection(await t.ctx(), { name: "Nope", apiKey: "re_send_sending" }),
    ).rejects.toMatchObject({
      code: "key_sending_only",
      message: expect.stringContaining("This key can only send email. Create a Full access key"),
      fieldErrors: { apiKey: [expect.any(String)] },
    });
    expect(await models.ConnectionModel.countDocuments({ orgId: t.orgId })).toBe(0);
    expect(jobs.sentJobs).toHaveLength(0);
  });

  it("rejects an invalid or revoked key", async () => {
    const t = await newOrg();
    await expect(
      svc.addConnection(await t.ctx(), { name: "Bad", apiKey: "re_bad_invalid" }),
    ).rejects.toMatchObject({
      code: "key_invalid",
      message: expect.stringContaining("Resend rejected this key"),
    });
  });

  it("blocks the same Resend team twice in one org, even with another key, but not across orgs", async () => {
    const a = await newOrg();
    await svc.addConnection(await a.ctx(), { name: "One", apiKey: "re_dupe_full_aaaa" });
    await expect(
      svc.addConnection(await a.ctx(), { name: "Two", apiKey: "re_dupe_full_bbbb" }),
    ).rejects.toMatchObject({
      code: "conflict",
      message: expect.stringContaining("already connected as “One”"),
    });
    expect(await models.ConnectionModel.countDocuments({ orgId: a.orgId })).toBe(1);

    // Another org (an agency and its client) may connect the same team.
    const b = await newOrg();
    await expect(
      svc.addConnection(await b.ctx(), { name: "One", apiKey: "re_dupe_full_cccc" }),
    ).resolves.toMatchObject({ status: "active" });
    const fps = await models.ConnectionModel.find({
      resendTeamFingerprint: { $exists: true },
    }).lean();
    const fpsOfDupe = fps.filter((c) => [a.orgId, b.orgId].some((o) => o.equals(c.orgId)));
    expect(new Set(fpsOfDupe.map((c) => c.resendTeamFingerprint)).size).toBe(2); // not correlatable
  });

  it("recognises a team by its older key after it added a domain", async () => {
    const t = await newOrg();
    await svc.addConnection(await t.ctx(), {
      name: "Early",
      apiKey: "re_grow_full_1111_nodomains",
    });
    // The team later verifies a domain; a new key still resolves to the same team via its keys.
    fake.fakeStore().teams.get("grow")!.domains.push({
      id: "dom_late",
      name: "late.com",
      status: "verified",
      region: "us-east-1",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    await expect(
      svc.addConnection(await t.ctx(), { name: "Late", apiKey: "re_grow_full_2222" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("saves as needs_attention when the account has no free webhook slot, and retry recovers", async () => {
    const t = await newOrg();
    const filler = new fake.FakeResendAdapter("re_crowd_full_x");
    const ids: string[] = [];
    for (let i = 0; i < fake.FAKE_WEBHOOK_LIMIT; i++) {
      ids.push((await filler.createWebhook({ endpoint: "https://elsewhere", events: [] })).id);
    }

    const ctx = await t.ctx();
    const dto = await svc.addConnection(ctx, { name: "Crowded", apiKey: "re_crowd_full_y" });
    expect(dto).toMatchObject({
      status: "needs_attention",
      statusReason: "webhook_slot_unavailable",
      webhookRegistered: false,
    });
    expect(jobs.sentJobs).toHaveLength(0); // no sync until it is active
    expect(
      await models.AuditLogModel.find({
        orgId: t.orgId,
        action: "connection.needs_attention",
      }).lean(),
    ).toHaveLength(1);

    // Still full: retry keeps it in needs_attention.
    expect(await svc.retryConnectionSetup(ctx, { connectionId: dto.id })).toMatchObject({
      status: "needs_attention",
    });

    // The user frees a slot in Resend, then retries.
    await filler.deleteWebhook(ids[0]!);
    const retried = await svc.retryConnectionSetup(ctx, { connectionId: dto.id });
    expect(retried).toMatchObject({
      status: "active",
      statusReason: null,
      webhookRegistered: true,
    });
    expect(jobs.sentJobs).toHaveLength(1);
  });

  it("enforces the plan's connection limit (free = 1)", async () => {
    const t = await newOrg("free");
    const ctx = await t.ctx();
    await svc.addConnection(ctx, { name: "First", apiKey: "re_lim1_full" });
    await expect(
      svc.addConnection(ctx, { name: "Second", apiKey: "re_lim2_full" }),
    ).rejects.toMatchObject({
      code: "plan_limit_reached",
      message: expect.stringContaining("1 of 1 Resend account on Free"),
    });
    expect(await svc.getConnectionQuota(ctx)).toEqual({
      used: 1,
      limit: 1,
      planLabel: "Free",
      nextTierLabel: "Pro",
    });
  });

  it("two concurrent adds at the limit: exactly one wins", async () => {
    const t = await newOrg("free");
    const ctx = await t.ctx();
    const results = await Promise.allSettled([
      svc.addConnection(ctx, { name: "Race A", apiKey: "re_raceA_full" }),
      svc.addConnection(ctx, { name: "Race B", apiKey: "re_raceB_full" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "plan_limit_reached" });
    expect(await models.ConnectionModel.countDocuments({ orgId: t.orgId })).toBe(1);
  });

  it("rejects a duplicate name in the same org", async () => {
    const t = await newOrg();
    const ctx = await t.ctx();
    await svc.addConnection(ctx, { name: "Same", apiKey: "re_n1_full" });
    await expect(
      svc.addConnection(ctx, { name: "Same", apiKey: "re_n2_full" }),
    ).rejects.toMatchObject({ code: "conflict", fieldErrors: { name: [expect.any(String)] } });
  });
});

describe("permissions (server actions)", () => {
  it("viewers and developers are forbidden; admins can add, rename and remove", async () => {
    const t = await newOrg();
    const viewer = await t.addMember("viewer");
    const developer = await t.addMember("developer");
    const admin = await t.addMember("admin");
    const input = { name: "Acme", apiKey: "re_perm_full" };

    headerState.current = viewer.headers;
    expect(await actions.addConnectionAction(t.slug, input)).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    headerState.current = developer.headers;
    expect(await actions.addConnectionAction(t.slug, input)).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(await models.ConnectionModel.countDocuments({ orgId: t.orgId })).toBe(0);

    headerState.current = admin.headers;
    const added = await actions.addConnectionAction(t.slug, input);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const id = added.data.id;

    headerState.current = viewer.headers;
    expect(
      await actions.renameConnectionAction(t.slug, { connectionId: id, name: "Hacked" }),
    ).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(
      await actions.removeConnectionAction(t.slug, { connectionId: id, confirmName: "Acme" }),
    ).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await actions.retryConnectionAction(t.slug, { connectionId: id })).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    // Viewers may read (list) but the DTO never carries secrets.
    const list = await svc.listConnections(await t.ctxOf(viewer));
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toMatch(/ciphertext|wrappedDek|whsec_/);

    headerState.current = admin.headers;
    expect(
      await actions.renameConnectionAction(t.slug, { connectionId: id, name: "Acme 2" }),
    ).toMatchObject({
      ok: true,
      data: { name: "Acme 2" },
    });
    expect(
      await actions.removeConnectionAction(t.slug, { connectionId: id, confirmName: "Acme 2" }),
    ).toMatchObject({ ok: true });
  });

  it("validates input: key must start with re_", async () => {
    const t = await newOrg();
    headerState.current = t.owner.headers;
    expect(
      await actions.addConnectionAction(t.slug, { name: "X1", apiKey: "sk_live_abc" }),
    ).toMatchObject({
      ok: false,
      error: { code: "validation", fieldErrors: { apiKey: [expect.stringContaining("re_")] } },
    });
  });

  it("actions map service errors to typed results", async () => {
    const t = await newOrg();
    headerState.current = t.owner.headers;
    expect(
      await actions.addConnectionAction(t.slug, { name: "Sender", apiKey: "re_act_sending" }),
    ).toMatchObject({
      ok: false,
      error: { code: "key_sending_only" },
    });
  });
});

describe("renameConnection", () => {
  it("renames, audits, and refuses a name already in use", async () => {
    const t = await newOrg();
    const ctx = await t.ctx();
    const a = await svc.addConnection(ctx, { name: "Alpha", apiKey: "re_ra_full" });
    await svc.addConnection(ctx, { name: "Beta", apiKey: "re_rb_full" });

    expect(
      await svc.renameConnection(ctx, { connectionId: a.id, name: "Alpha Renamed" }),
    ).toMatchObject({
      name: "Alpha Renamed",
    });
    const log = await models.AuditLogModel.findOne({
      orgId: t.orgId,
      action: "connection.renamed",
    }).lean();
    expect(log!.changes).toMatchObject({
      before: { name: "Alpha" },
      after: { name: "Alpha Renamed" },
    });
    await expect(
      svc.renameConnection(ctx, { connectionId: a.id, name: "Beta" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("cannot touch another org's connection", async () => {
    const a = await newOrg();
    const b = await newOrg();
    const conn = await svc.addConnection(await a.ctx(), { name: "Mine", apiKey: "re_xo_full" });
    await expect(
      svc.renameConnection(await b.ctx(), { connectionId: conn.id, name: "Stolen" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      svc.removeConnection(await b.ctx(), { connectionId: conn.id, confirmName: "Mine" }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect((await rawDoc(conn.id))!.name).toBe("Mine");
  });
});

describe("removeConnection", () => {
  it("deletes our webhook in Resend, soft-deletes, wipes key material and frees name and team", async () => {
    const t = await newOrg();
    const ctx = await t.ctx();
    const dto = await svc.addConnection(ctx, { name: "Doomed", apiKey: "re_rm_full_9999" });
    const team = fake.fakeStore().teams.get("rm")!;
    expect(team.webhooks.size).toBe(1);

    await expect(
      svc.removeConnection(ctx, { connectionId: dto.id, confirmName: "wrong" }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(team.webhooks.size).toBe(1);

    expect(
      await svc.removeConnection(ctx, { connectionId: dto.id, confirmName: "Doomed" }),
    ).toEqual({
      id: dto.id,
      webhook: "deleted",
    });
    expect(team.webhooks.size).toBe(0);

    const doc = (await rawDoc(dto.id))!;
    expect(doc.deletedAt).toBeInstanceOf(Date);
    expect(doc.status).toBe("disabled");
    expect(doc.apiKey).toBeUndefined();
    expect(doc.webhook).toBeUndefined();
    expect(JSON.stringify(doc)).not.toMatch(/ciphertext|wrappedDek/);
    expect(await svc.listConnections(ctx)).toEqual([]);
    expect(await svc.readWebhookSigningSecret(dto.id)).toBeNull();
    expect(
      await models.AuditLogModel.countDocuments({ orgId: t.orgId, action: "connection.removed" }),
    ).toBe(1);

    // Name and team are free again.
    await expect(
      svc.addConnection(ctx, { name: "Doomed", apiKey: "re_rm_full_8888" }),
    ).resolves.toMatchObject({ status: "active" });
  });

  it("still removes when the webhook is already gone in Resend", async () => {
    const t = await newOrg();
    const ctx = await t.ctx();
    const dto = await svc.addConnection(ctx, { name: "Gone", apiKey: "re_gone_full" });
    fake.fakeStore().teams.get("gone")!.webhooks.clear();
    expect(
      await svc.removeConnection(ctx, { connectionId: dto.id, confirmName: "Gone" }),
    ).toMatchObject({
      webhook: "already_gone",
    });
    expect(await svc.listConnections(ctx)).toEqual([]);
  });

  it("still removes when Resend is unreachable (best effort)", async () => {
    const t = await newOrg();
    const ctx = await t.ctx();
    const dto = await svc.addConnection(ctx, { name: "Flaky", apiKey: "re_flaky_full" });
    // The key is revoked in Resend before removal: deleting our webhook fails.
    const doc = (await rawDoc(dto.id))!;
    const rotated = envelope.encryptSecret("re_flaky_invalid", {
      aad: `connections:${dto.id}:apiKey`,
    });
    await models.ConnectionModel.updateOne({ _id: doc._id }, { $set: { apiKey: rotated } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await svc.removeConnection(ctx, { connectionId: dto.id, confirmName: "Flaky" }),
    ).toMatchObject({
      webhook: "failed",
    });
    spy.mockRestore();
    expect((await rawDoc(dto.id))!.deletedAt).toBeInstanceOf(Date);
  });
});

describe("connection indexes", () => {
  it("enforce (orgId, name) and (orgId, fingerprint) uniqueness among live connections only", async () => {
    const orgId = new Types.ObjectId();
    const base = { orgId, createdBy: new Types.ObjectId(), status: "active" as const };
    const make = (over: Record<string, unknown>) =>
      models.ConnectionModel.create({ ...base, name: "n", resendTeamFingerprint: "fp", ...over });

    const first = await make({});
    await expect(make({ resendTeamFingerprint: "other" })).rejects.toMatchObject({ code: 11000 });
    await expect(make({ name: "other" })).rejects.toMatchObject({ code: 11000 });
    await models.ConnectionModel.updateOne({ _id: first._id }, { deletedAt: new Date() });
    await expect(make({})).resolves.toBeTruthy(); // freed by the soft delete
  });
});
