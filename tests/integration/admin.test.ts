import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { signUpVerified, startTestDb, uniqueEmail } from "./helpers";

// next/headers is request-scoped; tests drive it by hand. Cookies Better Auth sets through
// `nextCookies` are captured so impersonation can switch the "browser" to the new session.
const headerState = vi.hoisted(() => ({ current: new Headers() }));
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  headers: async () => headerState.current,
  cookies: async () => ({
    set(name: string, value: string) {
      if (value) jar.set(name, value);
      else jar.delete(name);
    },
    get() {},
    delete() {},
    getAll: () => [],
  }),
}));

// Sign-ups hash passwords; give the slower tests room.
vi.setConfig({ testTimeout: 30_000 });

const BOSS_EMAIL = "boss@wisemail-admin.test";

let stop: () => Promise<void>;
let auth: typeof import("@/lib/auth/server").auth;
let models: typeof import("@/lib/db/models");
let dal: typeof import("@/lib/dal");
let guard: typeof import("@/lib/admin/guard");
let adminAction: typeof import("@/lib/admin/action").adminAction;
let users: typeof import("@/lib/services/admin/users");
let orgsSvc: typeof import("@/lib/services/admin/orgs");
let overview: typeof import("@/lib/services/admin/overview");
let health: typeof import("@/lib/services/admin/health");
let entitlements: typeof import("@/lib/billing/entitlements");
let actionMod: typeof import("@/lib/actions/action");
let banner: typeof import("@/components/admin/impersonation-banner");
let connect: typeof import("@/lib/db/connect");
let z: typeof import("zod");
let mongoose: typeof import("mongoose").default;

beforeAll(async () => {
  ({ stop } = await startTestDb("admin"));
  process.env.PLATFORM_ADMIN_EMAILS = ` ${BOSS_EMAIL.toUpperCase()}, other@nowhere.test `;
  connect = await import("@/lib/db/connect");
  auth = (await import("@/lib/auth/server")).auth;
  models = await import("@/lib/db/models");
  dal = await import("@/lib/dal");
  guard = await import("@/lib/admin/guard");
  adminAction = (await import("@/lib/admin/action")).adminAction;
  users = await import("@/lib/services/admin/users");
  orgsSvc = await import("@/lib/services/admin/orgs");
  overview = await import("@/lib/services/admin/overview");
  health = await import("@/lib/services/admin/health");
  entitlements = await import("@/lib/billing/entitlements");
  actionMod = await import("@/lib/actions/action");
  banner = await import("@/components/admin/impersonation-banner");
  z = await import("zod");
  mongoose = (await import("mongoose")).default;
  await connect.connectDb();
}, 120_000);

afterAll(async () => {
  await connect?.disconnectDb();
  await stop?.();
});

type Session = { id: string; headers: Headers };
const as = (u: Session | Headers | null) => {
  headerState.current = u instanceof Headers ? u : (u?.headers ?? new Headers());
};

async function signUp(name: string, email = uniqueEmail(name.toLowerCase())) {
  return { ...(await signUpVerified(auth, { name, email })), email, name };
}

/** Promotes a user the way an operator would with a database edit. */
async function makeAdmin(u: { id: string }) {
  await mongoose.connection
    .collection("user")
    .updateOne({ _id: new Types.ObjectId(u.id) }, { $set: { role: "admin" } });
}

async function createOrg(owner: Session, slug: string) {
  return auth.api.createOrganization({
    headers: owner.headers,
    body: { name: `Org ${slug}`, slug },
  });
}

const adminActor = (u: { id: string; name: string; email: string }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
});

const cookieHeader = () =>
  new Headers({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") });

const notFound = { digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404") };

describe("platform admin guard", () => {
  it("404s for visitors and members, passes for admins", async () => {
    const member = await signUp("Mia");
    const boss = await signUp("Bea");
    await makeAdmin(boss);

    as(null);
    expect(await guard.getPlatformAdmin()).toBeNull();
    await expect(guard.requirePlatformAdmin()).rejects.toMatchObject(notFound);

    as(member);
    expect(await guard.getPlatformAdmin()).toBeNull();
    await expect(guard.requirePlatformAdmin()).rejects.toMatchObject(notFound);

    as(boss);
    await expect(guard.requirePlatformAdmin()).resolves.toMatchObject({
      id: boss.id,
      email: boss.email,
    });
  });

  it("admin actions answer not_found to non-admins and never run", async () => {
    const member = await signUp("Nora");
    const run = vi.fn(async () => "ran");
    const action = adminAction({ input: z.z.object({}) }, run);
    as(member);
    expect(await action({})).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(run).not.toHaveBeenCalled();
    as(null);
    expect(await action({})).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("service actions refuse a caller whose own session is not an admin", async () => {
    const member = await signUp("Milo");
    const target = await signUp("Tess");
    as(member);
    // The Better Auth admin plugin double-checks the role: a forged AdminActor still fails.
    await expect(
      users.banUser(adminActor(member), { userId: target.id, reason: "because" }),
    ).rejects.toThrow();
    expect(
      await mongoose.connection.collection("user").findOne({ email: target.email }),
    ).toMatchObject({
      banned: false,
    });
  });
});

describe("allowlist bootstrap", () => {
  it("promotes an allowlisted, verified address on sign-in (case-insensitive) and only that", async () => {
    const other = await signUp("Olga");
    await models.AuditLogModel.countDocuments();
    const boss = await signUpVerified(auth, { name: "Boss", email: BOSS_EMAIL });
    const row = (email: string) => mongoose.connection.collection("user").findOne({ email });
    expect(await row(BOSS_EMAIL)).toMatchObject({ role: "admin" });
    expect(await row(other.email)).toMatchObject({ role: "user" });

    as(boss);
    await expect(guard.requirePlatformAdmin()).resolves.toMatchObject({ email: BOSS_EMAIL });
  });

  it("does not promote an unverified address (no session exists for it)", async () => {
    const email = "other@nowhere.test";
    await auth.api.signUpEmail({
      body: { name: "Unverified", email, password: "correct horse battery" },
    });
    await expect(
      auth.api.signInEmail({ body: { email, password: "correct horse battery" } }),
    ).rejects.toThrow();
    const row = await mongoose.connection.collection("user").findOne({ email });
    expect(row?.role).not.toBe("admin");
  });
});

describe("ban", () => {
  it("blocks sign-in, ends sessions, unbans, and is audited with the reason", async () => {
    const boss = await signUp("Bo");
    await makeAdmin(boss);
    const victim = await signUp("Vic");
    as(boss);

    await users.banUser(adminActor(boss), { userId: victim.id, reason: "spam campaign" });
    await expect(
      auth.api.signInEmail({ body: { email: victim.email, password: "correct horse battery" } }),
    ).rejects.toMatchObject({ body: { code: "BANNED_USER" } });
    // The session they had is gone.
    as(victim);
    expect(await dal.getSession()).toBeNull();

    as(boss);
    const detail = await users.getUserDetail(victim.id);
    expect(detail).toMatchObject({ banned: true, banReason: "spam campaign" });

    await users.unbanUser(adminActor(boss), { userId: victim.id });
    await expect(
      auth.api.signInEmail({ body: { email: victim.email, password: "correct horse battery" } }),
    ).resolves.toBeTruthy();

    const banned = await models.AuditLogModel.findOne({
      action: "admin.user_banned",
      "target.id": new Types.ObjectId(victim.id),
    }).lean();
    expect(banned).toMatchObject({ actorType: "user", reason: "spam campaign" });
    expect(banned!.actorId!.toHexString()).toBe(boss.id);
    expect(banned!.orgId.toHexString()).toBe("0".repeat(24));
    expect(
      await models.AuditLogModel.countDocuments({ action: "admin.user_unbanned" }),
    ).toBeGreaterThan(0);
  });

  it("refuses to ban yourself or another admin", async () => {
    const a = await signUp("Ada");
    const b = await signUp("Bob");
    await makeAdmin(a);
    await makeAdmin(b);
    as(a);
    await expect(
      users.banUser(adminActor(a), { userId: a.id, reason: "oops" }),
    ).rejects.toMatchObject({
      code: "validation",
    });
    await expect(
      users.banUser(adminActor(a), { userId: b.id, reason: "oops" }),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("revokes sessions and audits it", async () => {
    const boss = await signUp("Rae");
    await makeAdmin(boss);
    const target = await signUp("Rob");
    as(boss);
    await users.revokeUserSessions(adminActor(boss), { userId: target.id, reason: "lost laptop" });
    as(target);
    expect(await dal.getSession()).toBeNull();
    expect(
      await models.AuditLogModel.countDocuments({
        action: "admin.sessions_revoked",
        reason: "lost laptop",
      }),
    ).toBe(1);
  });
});

describe("impersonation", () => {
  it("swaps the session, shows the banner, stops cleanly, and audits under each workspace", async () => {
    const boss = await signUp("Ivy");
    await makeAdmin(boss);
    const owner = await signUp("Ollie");
    const org = await createOrg(owner, "imp-co");
    await orgsSvc.getOrgDetail(org.id);

    jar.clear();
    // Next's cookie store is not available here: record what Better Auth would set.
    const record = (name: "impersonateUser" | "stopImpersonating") => {
      const original = (auth.api[name] as (o: unknown) => Promise<unknown>).bind(auth.api);
      vi.spyOn(auth.api, name).mockImplementation((async (opts: object) => {
        const res = (await original({ ...opts, returnHeaders: true })) as {
          headers: Headers;
          response: unknown;
        };
        for (const c of res.headers.getSetCookie()) {
          const [pair] = c.split(";");
          const [k, ...v] = pair!.split("=");
          if (v.join("=") === "" || /max-age=0/i.test(c)) jar.delete(k!);
          else jar.set(k!, v.join("="));
        }
        return res.response;
      }) as never);
    };
    record("impersonateUser");
    record("stopImpersonating");
    as(boss);
    const { path } = await users.startImpersonation(adminActor(boss), {
      userId: owner.id,
      reason: "ticket 4411",
    });
    expect(path).toBe("/imp-co");

    // The browser now carries the impersonation session.
    as(cookieHeader());
    const session = await dal.getSession();
    expect(session?.user.id).toBe(owner.id);
    expect((session!.session as { impersonatedBy?: string }).impersonatedBy).toBe(boss.id);
    // The impersonated session is not an admin session, even though its owner's admin is the actor.
    expect(await guard.getPlatformAdmin()).toBeNull();

    const el = await banner.ImpersonationBanner();
    expect(el).not.toBeNull();
    expect(JSON.stringify(el)).toContain("Viewing as");
    expect(JSON.stringify(el)).toContain("Ollie");

    // A normal session shows no banner.
    as(owner);
    expect(await banner.ImpersonationBanner()).toBeNull();

    // Stop restores the admin's own session.
    as(cookieHeader());
    const { endImpersonation } = users;
    await endImpersonation({ adminId: boss.id, targetUserId: owner.id });
    as(cookieHeader());
    const restored = await dal.getSession();
    expect(restored?.user.id).toBe(boss.id);
    expect((restored!.session as { impersonatedBy?: string }).impersonatedBy).toBeUndefined();
    expect(await guard.getPlatformAdmin()).toMatchObject({ id: boss.id });

    const orgOid = new Types.ObjectId(org.id);
    const started = await models.AuditLogModel.find({
      orgId: orgOid,
      action: "admin.impersonation_started",
    }).lean();
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ reason: "ticket 4411" });
    expect(
      await models.AuditLogModel.countDocuments({
        orgId: orgOid,
        action: "admin.impersonation_stopped",
      }),
    ).toBe(1);
    expect(
      await models.AuditLogModel.countDocuments({
        action: "admin.impersonation_started",
        orgId: new Types.ObjectId("0".repeat(24)),
      }),
    ).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });

  it("cannot impersonate another admin (or yourself, or a banned user)", async () => {
    const a = await signUp("Abe");
    const b = await signUp("Bev");
    await makeAdmin(a);
    await makeAdmin(b);
    as(a);
    await expect(
      users.startImpersonation(adminActor(a), { userId: b.id, reason: "just looking" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      users.startImpersonation(adminActor(a), { userId: a.id, reason: "just looking" }),
    ).rejects.toMatchObject({ code: "validation" });
    // Even the Better Auth endpoint itself refuses when the service is bypassed.
    await expect(
      auth.api.impersonateUser({ headers: a.headers, body: { userId: b.id } }),
    ).rejects.toMatchObject({ body: { code: "YOU_CANNOT_IMPERSONATE_ADMINS" } });
    expect(
      await models.AuditLogModel.countDocuments({
        action: "admin.impersonation_started",
        "target.id": new Types.ObjectId(b.id),
      }),
    ).toBe(0);
  });
});

describe("organizations", () => {
  it("limit overrides apply through entitlements, clear back to the plan, and are audited", async () => {
    const boss = await signUp("Lou");
    await makeAdmin(boss);
    const owner = await signUp("Lena");
    const org = await createOrg(owner, "limits-co");
    const orgId = new Types.ObjectId(org.id);
    as(boss);

    expect((await entitlements.getEntitlements(orgId)).limits.connections).toBe(1);
    await orgsSvc.setLimitOverrides(adminActor(boss), {
      orgId: org.id,
      overrides: { connections: 7, emailsTrackedPerMonth: 123_456 },
      reason: "sales deal",
    });
    let e = await entitlements.getEntitlements(orgId);
    expect(e.limits.connections).toBe(7);
    expect(e.limits.emailsTrackedPerMonth).toBe(123_456);
    // Other limits untouched.
    expect(e.limits.members).toBe(2);

    const detail = await orgsSvc.getOrgDetail(org.id);
    expect(detail!.limits.find((l) => l.key === "connections")).toMatchObject({
      effective: 7,
      catalog: 1,
      override: 7,
    });

    await orgsSvc.setLimitOverrides(adminActor(boss), {
      orgId: org.id,
      overrides: { connections: null, emailsTrackedPerMonth: null },
      reason: "deal over",
    });
    e = await entitlements.getEntitlements(orgId);
    expect(e.limits.connections).toBe(1);
    expect(e.limits.emailsTrackedPerMonth).toBe(5_000);

    const rows = await models.AuditLogModel.find({ orgId, action: "admin.limits_overridden" })
      .sort({ createdAt: 1 })
      .lean();
    expect(rows.map((r) => r.reason)).toEqual(["sales deal", "deal over"]);
    expect(rows[0]!.changes!.after).toMatchObject({ limitOverrides: { connections: 7 } });
    await expect(
      orgsSvc.setLimitOverrides(adminActor(boss), {
        orgId: org.id,
        overrides: {},
        reason: "nothing",
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("changes plans through the plan-change service and starts or extends trials", async () => {
    const boss = await signUp("Pam");
    await makeAdmin(boss);
    const owner = await signUp("Pete");
    const org = await createOrg(owner, "plan-co");
    const orgId = new Types.ObjectId(org.id);
    as(boss);

    await orgsSvc.adminChangePlan(adminActor(boss), {
      orgId: org.id,
      plan: "team",
      reason: "comped",
    });
    expect((await entitlements.getEntitlements(orgId)).plan).toBe("team");
    await expect(
      orgsSvc.adminChangePlan(adminActor(boss), { orgId: org.id, plan: "team", reason: "again" }),
    ).rejects.toMatchObject({ code: "validation" });
    await orgsSvc.adminChangePlan(adminActor(boss), {
      orgId: org.id,
      plan: "free",
      reason: "end of deal",
    });
    expect((await entitlements.getEntitlements(orgId)).plan).toBe("free");

    await orgsSvc.adminGrantTrial(adminActor(boss), {
      orgId: org.id,
      days: 30,
      reason: "evaluating",
    });
    let e = await entitlements.getEntitlements(orgId);
    expect(e).toMatchObject({ plan: "pro", planState: "trialing" });
    expect(e.trial!.daysLeft).toBeGreaterThanOrEqual(29);
    await orgsSvc.adminGrantTrial(adminActor(boss), {
      orgId: org.id,
      days: 10,
      reason: "more time",
    });
    e = await entitlements.getEntitlements(orgId);
    expect(e.trial!.daysLeft).toBeGreaterThanOrEqual(39);

    const actions = (await models.AuditLogModel.find({ orgId, action: /^admin\./ }).lean()).map(
      (r) => r.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(["admin.plan_changed", "admin.trial_started", "admin.trial_extended"]),
    );
    // The regular plan-change audit entry is written too, with the admin as actor.
    expect(
      await models.AuditLogModel.countDocuments({
        orgId,
        action: "plan.changed",
        actorId: new Types.ObjectId(boss.id),
      }),
    ).toBeGreaterThan(0);
  });

  it("a suspended workspace is closed to members until the suspension is lifted", async () => {
    const boss = await signUp("Sue");
    await makeAdmin(boss);
    const owner = await signUp("Sam");
    const org = await createOrg(owner, "held-co");
    const orgId = new Types.ObjectId(org.id);
    const action = actionMod.orgAction({ input: z.z.object({}) }, async () => "ran");

    as(owner);
    expect(await action("held-co", {})).toMatchObject({ ok: true });

    as(boss);
    await orgsSvc.suspendOrg(adminActor(boss), { orgId: org.id, reason: "chargeback dispute" });
    await expect(
      orgsSvc.suspendOrg(adminActor(boss), { orgId: org.id, reason: "twice" }),
    ).rejects.toMatchObject({ code: "conflict" });

    as(owner);
    expect(await dal.getOrgContext("held-co")).toMatchObject({
      status: "suspended",
      org: { slug: "held-co" },
    });
    await expect(dal.requireOrg("held-co")).rejects.toMatchObject({
      digest: expect.stringContaining("/suspended/held-co"),
    });
    expect(await action("held-co", {})).toMatchObject({
      ok: false,
      error: { code: "workspace_suspended" },
    });

    as(boss);
    expect((await orgsSvc.getOrgDetail(org.id))!.suspended).toMatchObject({
      reason: "chargeback dispute",
    });
    await orgsSvc.unsuspendOrg(adminActor(boss), { orgId: org.id });

    as(owner);
    await expect(dal.requireOrg("held-co")).resolves.toMatchObject({ role: "owner" });
    expect(await action("held-co", {})).toMatchObject({ ok: true });

    const rows = await models.AuditLogModel.find({ orgId, action: /^admin\.org_/ })
      .sort({ createdAt: 1 })
      .lean();
    expect(rows.map((r) => r.action)).toEqual(["admin.org_suspended", "admin.org_unsuspended"]);
    expect(rows[0]).toMatchObject({ reason: "chargeback dispute" });
  });
});

describe("lists, overview and health", () => {
  it("lists users and orgs with keyset pagination and search", async () => {
    const tag = `pg${Date.now()}`;
    const made = [];
    for (let i = 0; i < 3; i++) made.push(await signUp(`Page${i}`, `${tag}-${i}@example.com`));
    const first = await users.listUsers({ q: tag, limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await users.listUsers({ q: tag, limit: 2, cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items].map((u) => u.id);
    expect(new Set(ids).size).toBe(3);
    expect((await users.listUsers({ q: "no-such-person-$(" })).items).toHaveLength(0);

    await createOrg(made[0]!, `${tag}-co`);
    const orgs = await orgsSvc.listOrgs({ q: tag });
    expect(orgs.items).toHaveLength(1);
    expect(orgs.items[0]).toMatchObject({
      slug: `${tag}-co`,
      plan: "free",
      members: 1,
      connections: 0,
    });

    const detail = await users.getUserDetail(made[0]!.id);
    expect(detail!.memberships).toMatchObject([{ orgSlug: `${tag}-co`, role: "owner" }]);
    expect(await users.getUserDetail("not-an-id")).toBeNull();
    expect(await orgsSvc.getOrgDetail(new Types.ObjectId().toHexString())).toBeNull();
  });

  it("builds the overview and health reports", async () => {
    const o = await overview.getOverview();
    expect(o.counts.users).toBeGreaterThan(5);
    expect(o.counts.organizations).toBeGreaterThan(3);
    expect(o.plans.map((p) => p.plan)).toEqual(["free", "pro", "team", "agency"]);
    expect(o.recentSignups.length).toBeGreaterThan(0);
    const h = await health.getSystemHealth();
    expect(h.ingest).toMatchObject({ failedLast24h: 0, backlog: 0 });
    expect(h.inngestUrl).toMatch(/^http/);
  });
});
