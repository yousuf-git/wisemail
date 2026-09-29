import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
let svc: typeof import("@/lib/services/projects");
let actions: typeof import("@/app/(app)/[orgSlug]/settings/projects/actions");
let mongoose: typeof import("mongoose").default;
let connect: typeof import("@/lib/db/connect");
let validation: typeof import("@/lib/validation/project");

beforeAll(async () => {
  ({ stop } = await startTestDb("projects"));
  connect = await import("@/lib/db/connect");
  auth = (await import("@/lib/auth/server")).auth;
  models = await import("@/lib/db/models");
  dal = await import("@/lib/dal");
  svc = await import("@/lib/services/projects");
  actions = await import("@/app/(app)/[orgSlug]/settings/projects/actions");
  validation = await import("@/lib/validation/project");
  mongoose = (await import("mongoose")).default;
  await connect.connectDb();
  await models.ProjectModel.init();
  await models.MemberScopeModel.init();
}, 120_000);

afterAll(async () => {
  await connect?.disconnectDb();
  await stop?.();
});

type User = { id: string; headers: Headers };
let orgCounter = 0;

async function signUp(name: string): Promise<User> {
  return signUpVerified(auth, { name, email: uniqueEmail(name.toLowerCase()) });
}

async function newOrg(plan: "free" | "pro" | "team" = "team") {
  const owner = await signUp("Owner");
  const slug = `proj-org-${++orgCounter}`;
  const org = await auth.api.createOrganization({
    headers: owner.headers,
    body: { name: slug, slug },
  });
  const orgId = new Types.ObjectId(org.id);
  await models.OrgSettingsModel.updateOne({ orgId }, { plan });
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
  return { slug, orgId, owner, ctx: () => ctxOf(owner), ctxOf, addMember };
}

const blue = { color: "accent" as const };

describe("createProject", () => {
  it("creates with slug, palette color, audit and realtime, and lists with counts", async () => {
    const t = await newOrg();
    const ctx = await t.ctx();
    const dto = await svc.createProject(ctx, { name: "Acme Store", ...blue, description: "Shop" });
    expect(dto).toMatchObject({ name: "Acme Store", slug: "acme-store", color: "accent" });

    const audit = await models.AuditLogModel.find({ orgId: t.orgId, "target.type": "project" });
    expect(audit.map((a) => a.action)).toEqual(["project.created"]);
    const events = await models.RealtimeEventModel.find({ orgId: t.orgId, topics: "projects" });
    expect(events).toHaveLength(1);

    const list = await svc.listProjects(ctx);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ domainCount: 0, scopedMemberCount: 0 });
  });

  it("rejects colors outside the palette", () => {
    expect(
      validation.createProjectSchema.safeParse({ name: "X Y", color: "#ff0000" }).success,
    ).toBe(false);
    expect(
      validation.createProjectSchema.safeParse({ name: "X Y", color: "engaged" }).success,
    ).toBe(true);
  });

  it("keeps names and slugs unique among live projects, ignoring case", async () => {
    const t = await newOrg();
    const ctx = await t.ctx();
    await svc.createProject(ctx, { name: "Marketing", ...blue });
    await expect(svc.createProject(ctx, { name: "Marketing", ...blue })).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(svc.createProject(ctx, { name: "marketing", ...blue })).rejects.toMatchObject({
      code: "conflict",
    });
    // Other orgs are independent.
    const other = await newOrg();
    await expect(
      svc.createProject(await other.ctx(), { name: "Marketing", ...blue }),
    ).resolves.toBeTruthy();
  });

  it("enforces the plan project limit (Free 1, Pro 5, Team unlimited) with an upgrade hint", async () => {
    const free = await newOrg("free");
    const fctx = await free.ctx();
    await svc.createProject(fctx, { name: "One", ...blue });
    await expect(svc.createProject(fctx, { name: "Two", ...blue })).rejects.toMatchObject({
      code: "plan_limit_reached",
      message: expect.stringContaining("Upgrade to Pro"),
    });
    expect(await svc.getProjectQuota(fctx)).toMatchObject({ used: 1, limit: 1, planLabel: "Free" });

    const pro = await newOrg("pro");
    const pctx = await pro.ctx();
    for (let i = 1; i <= 5; i++) await svc.createProject(pctx, { name: `P${i}`, ...blue });
    await expect(svc.createProject(pctx, { name: "P6", ...blue })).rejects.toMatchObject({
      code: "plan_limit_reached",
    });

    const team = await newOrg("team");
    const tctx = await team.ctx();
    for (let i = 1; i <= 7; i++) await svc.createProject(tctx, { name: `T${i}`, ...blue });
    expect((await svc.getProjectQuota(tctx)).limit).toBeNull();
  });

  it("honours limitOverrides.projects", async () => {
    const t = await newOrg("free");
    await models.OrgSettingsModel.updateOne(
      { orgId: t.orgId },
      { limitOverrides: { projects: 3 } },
    );
    const ctx = await t.ctx();
    for (const n of ["A1", "A2", "A3"]) await svc.createProject(ctx, { name: n, ...blue });
    await expect(svc.createProject(ctx, { name: "A4", ...blue })).rejects.toMatchObject({
      code: "plan_limit_reached",
    });
  });

  it("serialises concurrent creates at the limit", async () => {
    const t = await newOrg("free");
    const ctx = await t.ctx();
    const results = await Promise.allSettled([
      svc.createProject(ctx, { name: "Race A", ...blue }),
      svc.createProject(ctx, { name: "Race B", ...blue }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await models.ProjectModel.countDocuments({ orgId: t.orgId })).toBe(1);
  });
});

describe("updateProject", () => {
  it("renames, recolors, audits, and blocks a clashing name", async () => {
    const t = await newOrg();
    const ctx = await t.ctx();
    const a = await svc.createProject(ctx, { name: "Alpha", ...blue });
    await svc.createProject(ctx, { name: "Beta", ...blue });

    const renamed = await svc.updateProject(ctx, {
      projectId: a.id,
      name: "Alpha Two",
      color: "coral",
      description: "x",
    });
    expect(renamed).toMatchObject({ name: "Alpha Two", slug: "alpha-two", color: "coral" });
    const audit = await models.AuditLogModel.findOne({ orgId: t.orgId, action: "project.renamed" });
    expect(audit!.changes!.before).toMatchObject({ name: "Alpha" });

    await expect(
      svc.updateProject(ctx, { projectId: a.id, name: "beta", color: "coral" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("cannot touch another org's project", async () => {
    const t1 = await newOrg();
    const t2 = await newOrg();
    const p = await svc.createProject(await t1.ctx(), { name: "Private", ...blue });
    await expect(
      svc.updateProject(await t2.ctx(), { projectId: p.id, name: "Hijack", color: "accent" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(svc.softDeleteProject(await t2.ctx(), { projectId: p.id })).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("softDeleteProject", () => {
  it("soft deletes, frees the name, unassigns domains/emails/threads and trims member scopes", async () => {
    const t = await newOrg("team");
    const ctx = await t.ctx();
    const doomed = await svc.createProject(ctx, { name: "Doomed", ...blue });
    const kept = await svc.createProject(ctx, { name: "Kept", ...blue });
    const doomedId = new Types.ObjectId(doomed.id);
    const keptId = new Types.ObjectId(kept.id);

    const db = mongoose.connection;
    const otherOrg = new Types.ObjectId();
    await db.collection("domains").insertMany([
      {
        orgId: t.orgId,
        name: "a.com",
        connectionId: new Types.ObjectId(),
        resendId: "a",
        projectId: doomedId,
      },
      {
        orgId: t.orgId,
        name: "b.com",
        connectionId: new Types.ObjectId(),
        resendId: "b",
        projectId: doomedId,
      },
      {
        orgId: t.orgId,
        name: "c.com",
        connectionId: new Types.ObjectId(),
        resendId: "c",
        projectId: keptId,
      },
      {
        orgId: otherOrg,
        name: "z.com",
        connectionId: new Types.ObjectId(),
        resendId: "z",
        projectId: doomedId,
      }, // another org: untouched
    ]);
    await db.collection("threads").insertOne({ orgId: t.orgId, projectId: doomedId });
    await db.collection("emails").insertOne({ orgId: t.orgId, projectId: doomedId });

    const memberA = new Types.ObjectId();
    const memberB = new Types.ObjectId();
    await models.MemberScopeModel.create([
      { orgId: t.orgId, memberId: memberA, projectIds: [doomedId] }, // left empty -> removed
      { orgId: t.orgId, memberId: memberB, projectIds: [doomedId, keptId] }, // keeps "kept"
    ]);

    const result = await svc.softDeleteProject(ctx, { projectId: doomed.id });
    expect(result).toMatchObject({ unassigned: 2, membersUnrestricted: 1 });

    const doc = await models.ProjectModel.findById(doomedId).lean();
    expect(doc!.deletedAt).toBeInstanceOf(Date);
    expect((await svc.listProjects(ctx)).map((p) => p.name)).toEqual(["Kept"]);

    const domains = await db.collection("domains").find({}).toArray();
    const by = (n: string) => domains.find((d) => d.name === n)!;
    expect(by("a.com").projectId).toBeNull();
    expect(by("b.com").projectId).toBeNull();
    expect(by("c.com").projectId.toHexString()).toBe(kept.id);
    expect(by("z.com").projectId.toHexString()).toBe(doomed.id);
    expect((await db.collection("threads").findOne({ orgId: t.orgId }))!.projectId).toBeNull();
    expect((await db.collection("emails").findOne({ orgId: t.orgId }))!.projectId).toBeNull();

    expect(await models.MemberScopeModel.findOne({ memberId: memberA })).toBeNull();
    const b = await models.MemberScopeModel.findOne({ memberId: memberB }).lean();
    expect(b!.projectIds.map(String)).toEqual([kept.id]);

    const audit = await models.AuditLogModel.findOne({ orgId: t.orgId, action: "project.deleted" });
    expect(audit).toBeTruthy();

    // Name is free again; deleted project can't be edited or deleted twice.
    await expect(svc.createProject(ctx, { name: "Doomed", ...blue })).resolves.toBeTruthy();
    await expect(svc.softDeleteProject(ctx, { projectId: doomed.id })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      svc.updateProject(ctx, { projectId: doomed.id, name: "Nope", color: "accent" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("deleting frees a slot under the plan limit", async () => {
    const t = await newOrg("free");
    const ctx = await t.ctx();
    const p = await svc.createProject(ctx, { name: "Only", ...blue });
    await svc.softDeleteProject(ctx, { projectId: p.id });
    await expect(svc.createProject(ctx, { name: "Fresh", ...blue })).resolves.toBeTruthy();
  });
});

describe("permissions", () => {
  it("only Owners and Admins manage projects; others are denied", async () => {
    const t = await newOrg();
    const owner = await t.ctx();
    const p = await svc.createProject(owner, { name: "Guarded", ...blue });

    for (const role of ["developer", "support", "viewer"] as const) {
      const user = await t.addMember(role);
      const ctx = await t.ctxOf(user);
      await expect(svc.createProject(ctx, { name: `X ${role}`, ...blue })).rejects.toBeInstanceOf(
        dal.ForbiddenError,
      );
      await expect(svc.listProjects(ctx)).rejects.toBeInstanceOf(dal.ForbiddenError);
      headerState.current = user.headers;
      expect(
        await actions.createProjectAction(t.slug, { name: `Y ${role}`, ...blue }),
      ).toMatchObject({ ok: false, error: { code: "forbidden" } });
      expect(await actions.deleteProjectAction(t.slug, { projectId: p.id })).toMatchObject({
        ok: false,
        error: { code: "forbidden" },
      });
    }

    const admin = await t.addMember("admin");
    headerState.current = admin.headers;
    expect(await actions.createProjectAction(t.slug, { name: "By admin", ...blue })).toMatchObject({
      ok: true,
    });
  });

  it("actions validate input", async () => {
    const t = await newOrg();
    headerState.current = t.owner.headers;
    const res = await actions.createProjectAction(t.slug, {
      name: "a",
      color: "accent",
    });
    expect(res).toMatchObject({ ok: false, error: { code: "validation" } });
  });
});

describe("usage summary (sidebar tile)", () => {
  it("reports the plan, real connection health and the plan's allowance; no invented usage", async () => {
    const usage = await import("@/lib/services/usage");
    const t = await newOrg("pro");
    const mk = (name: string, status: "active" | "needs_attention", fp: string) => ({
      orgId: t.orgId,
      name,
      resendTeamFingerprint: fp,
      status,
      createdBy: new Types.ObjectId(t.owner.id),
    });
    await models.ConnectionModel.create([
      mk("Good", "active", "f1"),
      mk("Hook", "needs_attention", "f2"),
      { ...mk("Removed", "active", "f3"), deletedAt: new Date() },
    ]);
    const summary = await usage.getUsageSummary(await t.ctx());
    expect(summary).toMatchObject({
      plan: "Pro",
      connectionLimit: 3,
      allowance: 75_000,
      used: { transactional: 0, broadcast: 0, inbound: 0 },
    });
    expect(summary.connections!.map((c) => c.health)).toEqual(["healthy", "attention"]);
    expect(summary.aiCredits).toBeUndefined();
  });
});

describe("slugifyProjectName", () => {
  it("makes url-safe slugs", () => {
    expect(validation.slugifyProjectName("  Café Ünïcode & Co.  ")).toBe("cafe-unicode-co");
    expect(validation.slugifyProjectName("!!!")).toBe("project");
  });
});
