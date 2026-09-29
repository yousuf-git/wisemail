import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { startTestDb, uniqueEmail } from "./helpers";

const headerState = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => headerState.current,
  cookies: async () => ({ set() {}, get() {}, delete() {}, getAll: () => [] }),
}));

let stop: () => Promise<void>;
let auth: typeof import("@/lib/auth/server").auth;
let models: typeof import("@/lib/db/models");
let dal: typeof import("@/lib/dal");
let members: typeof import("@/lib/services/members");
let scopes: typeof import("@/lib/services/member-scopes");
let scopeLib: typeof import("@/lib/services/project-scope");
let projects: typeof import("@/lib/services/projects");
let actions: typeof import("@/app/(app)/[orgSlug]/settings/members/actions");
let refs: typeof import("@/lib/db/refs");
let mongoose: typeof import("mongoose").default;
let connect: typeof import("@/lib/db/connect");

beforeAll(async () => {
  ({ stop } = await startTestDb("members"));
  connect = await import("@/lib/db/connect");
  auth = (await import("@/lib/auth/server")).auth;
  models = await import("@/lib/db/models");
  dal = await import("@/lib/dal");
  members = await import("@/lib/services/members");
  scopes = await import("@/lib/services/member-scopes");
  scopeLib = await import("@/lib/services/project-scope");
  projects = await import("@/lib/services/projects");
  actions = await import("@/app/(app)/[orgSlug]/settings/members/actions");
  refs = await import("@/lib/db/refs");
  mongoose = (await import("mongoose")).default;
  await connect.connectDb();
  await models.ProjectModel.init();
  await models.MemberScopeModel.init();
}, 120_000);

afterAll(async () => {
  await connect?.disconnectDb();
  await stop?.();
});

type Role = "owner" | "admin" | "developer" | "support" | "viewer";
type User = { id: string; email: string; name: string; headers: Headers };
let orgCounter = 0;

async function signUp(name: string, email = uniqueEmail(name.toLowerCase())): Promise<User> {
  const res = await auth.api.signUpEmail({
    body: { name, email, password: "correct horse battery" },
    returnHeaders: true,
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { id: res.response.user.id, email, name, headers: new Headers({ cookie }) };
}

async function newOrg(plan: "free" | "pro" | "team" = "team") {
  const owner = await signUp("Owner");
  const slug = `mem-org-${++orgCounter}`;
  const org = await auth.api.createOrganization({
    headers: owner.headers,
    body: { name: `Org ${slug}`, slug },
  });
  const orgId = new Types.ObjectId(org.id);
  await models.OrgSettingsModel.updateOne({ orgId }, { plan });
  const ctxOf = async (user: User) => {
    headerState.current = user.headers;
    const result = await dal.getOrgContext(slug);
    if (result.status !== "ok") throw new Error(`no context: ${result.status}`);
    return result.ctx;
  };
  const addMember = async (role: Role) => {
    const user = await signUp(role);
    await auth.api.addMember({ body: { userId: user.id, organizationId: org.id, role } });
    return user;
  };
  const memberIdOf = async (user: User) => {
    const m = await mongoose.connection
      .collection("member")
      .findOne({ organizationId: orgId, userId: new Types.ObjectId(user.id) });
    return m!._id.toHexString();
  };
  return { slug, orgId, owner, ctx: () => ctxOf(owner), ctxOf, addMember, memberIdOf };
}

const proj = (ctx: Awaited<ReturnType<Awaited<ReturnType<typeof newOrg>>["ctx"]>>, name: string) =>
  projects.createProject(ctx, { name, color: "accent" });

describe("project scopes", () => {
  it("sets, replaces and clears a scope; the context and projectFilter follow it", async () => {
    const t = await newOrg("team");
    const owner = await t.ctx();
    const a = await proj(owner, "Alpha");
    const b = await proj(owner, "Beta");
    const dev = await t.addMember("developer");
    const memberId = await t.memberIdOf(dev);

    expect(scopeLib.projectFilter(await t.ctxOf(dev))).toEqual({});

    await scopes.setMemberScope(owner, { memberId, projectIds: [a.id] });
    const scoped = await t.ctxOf(dev);
    expect(scoped.projectScope).toEqual([a.id]);
    const filter = scopeLib.projectFilter(scoped);
    expect(filter.projectId!.$in.map(String)).toEqual([a.id]);
    expect(scopeLib.canSeeProject(scoped, a.id)).toBe(true);
    expect(scopeLib.canSeeProject(scoped, b.id)).toBe(false);
    expect(scopeLib.canSeeProject(scoped, null)).toBe(false);

    await scopes.setMemberScope(owner, { memberId, projectIds: [a.id, b.id, a.id] });
    expect((await t.ctxOf(dev)).projectScope!.sort()).toEqual([a.id, b.id].sort());
    expect(await models.MemberScopeModel.countDocuments({ orgId: t.orgId })).toBe(1);

    await scopes.setMemberScope(owner, { memberId, projectIds: [] });
    expect(await models.MemberScopeModel.countDocuments({ orgId: t.orgId })).toBe(0);
    expect((await t.ctxOf(dev)).projectScope).toBeNull();

    const audit = await models.AuditLogModel.find({
      orgId: t.orgId,
      action: "member.scope_changed",
    });
    expect(audit).toHaveLength(3);
  });

  it("rejects projects from another org or deleted projects (assertRefs)", async () => {
    const t = await newOrg("team");
    const other = await newOrg("team");
    const owner = await t.ctx();
    const foreign = await proj(await other.ctx(), "Foreign");
    const mine = await proj(owner, "Mine");
    const gone = await proj(owner, "Gone");
    await projects.softDeleteProject(owner, { projectId: gone.id });
    const viewer = await t.addMember("viewer");
    const memberId = await t.memberIdOf(viewer);

    await expect(
      scopes.setMemberScope(owner, { memberId, projectIds: [mine.id, foreign.id] }),
    ).rejects.toBeInstanceOf(refs.RefError);
    await expect(
      scopes.setMemberScope(owner, { memberId, projectIds: [gone.id] }),
    ).rejects.toBeInstanceOf(refs.RefError);
    expect(await models.MemberScopeModel.countDocuments({ orgId: t.orgId })).toBe(0);

    // Through the action, the RefError becomes a typed not_found.
    headerState.current = t.owner.headers;
    expect(
      await actions.setMemberScopeAction(t.slug, { memberId, projectIds: [foreign.id] }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });

    // A member of another org can't be scoped from this one either.
    const otherUser = await other.addMember("viewer");
    await expect(
      scopes.setMemberScope(owner, {
        memberId: await other.memberIdOf(otherUser),
        projectIds: [mine.id],
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("owners and admins can't be scoped, and a stale scope doc is ignored", async () => {
    const t = await newOrg("team");
    const owner = await t.ctx();
    const p = await proj(owner, "P");
    const admin = await t.addMember("admin");
    const adminId = await t.memberIdOf(admin);
    await expect(
      scopes.setMemberScope(owner, { memberId: adminId, projectIds: [p.id] }),
    ).rejects.toMatchObject({ code: "scope_not_allowed" });
    await expect(
      scopes.setMemberScope(owner, {
        memberId: t.memberIdOf ? await t.memberIdOf(t.owner) : "",
        projectIds: [p.id],
      }),
    ).rejects.toMatchObject({ code: "scope_not_allowed" });

    await models.MemberScopeModel.create({
      orgId: t.orgId,
      memberId: new Types.ObjectId(adminId),
      projectIds: [new Types.ObjectId(p.id)],
    });
    expect((await t.ctxOf(admin)).projectScope).toBeNull();
  });

  it("scopes need a plan that includes them (Team+), but clearing is always allowed", async () => {
    const t = await newOrg("pro");
    const owner = await t.ctx();
    const p = await proj(owner, "P");
    const dev = await t.addMember("developer");
    const memberId = await t.memberIdOf(dev);
    await expect(
      scopes.setMemberScope(owner, { memberId, projectIds: [p.id] }),
    ).rejects.toMatchObject({ code: "plan_feature_locked" });
    await expect(scopes.setMemberScope(owner, { memberId, projectIds: [] })).resolves.toBeTruthy();
  });

  it("only Owners/Admins can set scopes", async () => {
    const t = await newOrg("team");
    const owner = await t.ctx();
    const p = await proj(owner, "P");
    const dev = await t.addMember("developer");
    const viewer = await t.addMember("viewer");
    const memberId = await t.memberIdOf(viewer);
    await expect(
      scopes.setMemberScope(await t.ctxOf(dev), { memberId, projectIds: [p.id] }),
    ).rejects.toBeInstanceOf(dal.ForbiddenError);
    headerState.current = dev.headers;
    expect(
      await actions.setMemberScopeAction(t.slug, { memberId, projectIds: [p.id] }),
    ).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
  });
});

describe("last-owner protection and role rules", () => {
  it("blocks demoting or removing the last Owner; allows it once there are two", async () => {
    const t = await newOrg();
    const owner = await t.ctx();
    const ownerId = await t.memberIdOf(t.owner);
    await expect(
      members.changeMemberRole(owner, { memberId: ownerId, role: "admin" }),
    ).rejects.toMatchObject({ code: "last_owner" });
    // Removing yourself is refused too; the last-owner rule guards the other path.
    const second = await t.addMember("owner");
    const secondCtx = await t.ctxOf(second);
    await members.changeMemberRole(secondCtx, { memberId: ownerId, role: "admin" });
    expect(
      (await models.AuditLogModel.findOne({ orgId: t.orgId, action: "member.role_changed" }))!
        .changes!.after,
    ).toMatchObject({ role: "admin" });

    // `second` is now the only Owner: an Admin can't remove them and they can't be demoted.
    const secondId = await t.memberIdOf(second);
    const adminCtx = await t.ctxOf(t.owner);
    await expect(members.removeMember(adminCtx, { memberId: secondId })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      members.changeMemberRole(secondCtx, { memberId: secondId, role: "viewer" }),
    ).rejects.toMatchObject({ code: "last_owner" });
    headerState.current = second.headers;
    expect(
      await actions.changeMemberRoleAction(t.slug, { memberId: secondId, role: "viewer" }),
    ).toMatchObject({ ok: false, error: { code: "last_owner" } });
  });

  it("removing the last remaining owner via removeMember is refused", async () => {
    const t = await newOrg();
    const ownerCtx = await t.ctx();
    const admin = await t.addMember("admin");
    // Admin cannot remove the Owner at all.
    await expect(
      members.removeMember(await t.ctxOf(admin), { memberId: await t.memberIdOf(t.owner) }),
    ).rejects.toMatchObject({ code: "forbidden" });
    // The sole Owner can't remove themselves.
    await expect(
      members.removeMember(ownerCtx, { memberId: await t.memberIdOf(t.owner) }),
    ).rejects.toMatchObject({ code: "last_owner" });
    // Nobody removes themselves from this screen, even with a second Owner around.
    const second = await t.addMember("owner");
    await expect(
      members.removeMember(await t.ctxOf(second), { memberId: await t.memberIdOf(second) }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("Admins can't grant or change Owner access; they manage other roles", async () => {
    const t = await newOrg();
    const admin = await t.addMember("admin");
    const viewer = await t.addMember("viewer");
    const adminCtx = await t.ctxOf(admin);
    const viewerId = await t.memberIdOf(viewer);
    await expect(
      members.changeMemberRole(adminCtx, { memberId: viewerId, role: "owner" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      members.changeMemberRole(adminCtx, {
        memberId: await t.memberIdOf(t.owner),
        role: "viewer",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      members.inviteMember(adminCtx, { email: uniqueEmail("x"), role: "owner", projectIds: [] }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      members.changeMemberRole(adminCtx, { memberId: viewerId, role: "support" }),
    ).resolves.toMatchObject({ role: "support" });
  });

  it("promoting to Admin drops the project scope; removing a member deletes it", async () => {
    const t = await newOrg("team");
    const owner = await t.ctx();
    const p = await proj(owner, "P");
    const dev = await t.addMember("developer");
    const memberId = await t.memberIdOf(dev);
    await scopes.setMemberScope(owner, { memberId, projectIds: [p.id] });
    await members.changeMemberRole(owner, { memberId, role: "admin" });
    expect(await models.MemberScopeModel.countDocuments({ orgId: t.orgId })).toBe(0);

    const viewer = await t.addMember("viewer");
    const vId = await t.memberIdOf(viewer);
    await scopes.setMemberScope(owner, { memberId: vId, projectIds: [p.id] });
    await members.removeMember(owner, { memberId: vId });
    expect(await models.MemberScopeModel.countDocuments({ orgId: t.orgId })).toBe(0);
    expect(
      await mongoose.connection.collection("member").findOne({ _id: new Types.ObjectId(vId) }),
    ).toBeNull();
    await expect(dal.getOrgContext(t.slug)).resolves.toBeTruthy();
    headerState.current = viewer.headers;
    expect(await dal.getOrgContext(t.slug)).toEqual({ status: "not_member" });
  });

  it("non-managers are denied every member operation", async () => {
    const t = await newOrg();
    const target = await t.addMember("viewer");
    const targetId = await t.memberIdOf(target);
    for (const role of ["developer", "support", "viewer"] as const) {
      const user = await t.addMember(role);
      const ctx = await t.ctxOf(user);
      const denied = expect.any(dal.ForbiddenError);
      await expect(members.listMembers(ctx)).rejects.toEqual(denied);
      await expect(
        members.inviteMember(ctx, { email: uniqueEmail("n"), role: "viewer", projectIds: [] }),
      ).rejects.toEqual(denied);
      await expect(
        members.changeMemberRole(ctx, { memberId: targetId, role: "admin" }),
      ).rejects.toEqual(denied);
      await expect(members.removeMember(ctx, { memberId: targetId })).rejects.toEqual(denied);
      headerState.current = user.headers;
      expect(await actions.removeMemberAction(t.slug, { memberId: targetId })).toMatchObject({
        ok: false,
        error: { code: "forbidden" },
      });
      expect(
        await actions.inviteMemberAction(t.slug, { email: uniqueEmail("n"), role: "viewer" }),
      ).toMatchObject({ ok: false, error: { code: "forbidden" } });
    }
  });
});

describe("invitations", () => {
  const asUser = (u: User) => ({ id: u.id, name: u.name, email: u.email, image: null });

  it("creates a copyable /invite link, lists it, and refreshes on re-invite", async () => {
    const t = await newOrg("team");
    const owner = await t.ctx();
    const email = uniqueEmail("Newbie");
    const inv = await members.inviteMember(owner, { email, role: "support", projectIds: [] });
    expect(inv.email).toBe(email.toLowerCase());
    expect(inv.link).toBe(`http://localhost:3000/invite/${inv.id}`);
    // 7 days (UC-02).
    const days = (new Date(inv.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    expect((await members.listInvitations(owner)).map((i) => i.id)).toEqual([inv.id]);
    const again = await members.inviteMember(owner, { email, role: "support", projectIds: [] });
    expect(again.id).toBe(inv.id);
    await expect(
      members.inviteMember(owner, { email, role: "viewer", projectIds: [] }),
    ).rejects.toMatchObject({ code: "conflict" });

    await members.cancelInvitation(owner, { invitationId: inv.id });
    expect(await members.listInvitations(owner)).toEqual([]);
    expect(
      await models.AuditLogModel.countDocuments({ orgId: t.orgId, action: "member.invited" }),
    ).toBe(2);
  });

  it("rejects inviting an existing member", async () => {
    const t = await newOrg("team");
    const owner = await t.ctx();
    const dev = await t.addMember("developer");
    await expect(
      members.inviteMember(owner, { email: dev.email, role: "viewer", projectIds: [] }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("counts members and pending invitations against the plan's seats", async () => {
    const t = await newOrg("free"); // 2 seats: the owner + one
    const owner = await t.ctx();
    await members.inviteMember(owner, { email: uniqueEmail("a"), role: "viewer", projectIds: [] });
    await expect(
      members.inviteMember(owner, { email: uniqueEmail("b"), role: "viewer", projectIds: [] }),
    ).rejects.toMatchObject({
      code: "plan_limit_reached",
      message: expect.stringContaining("Upgrade to Pro"),
    });
    expect(await members.getMemberQuota(owner)).toMatchObject({
      used: 2,
      limit: 2,
      scopesAllowed: false,
    });

    const agency = await newOrg("team");
    await models.OrgSettingsModel.updateOne({ orgId: agency.orgId }, { plan: "agency" });
    expect((await members.getMemberQuota(await agency.ctx())).limit).toBeNull();
  });

  it("accept flow: wrong recipient, success with scope applied, then reuse and expiry", async () => {
    const t = await newOrg("team");
    const owner = await t.ctx();
    const p = await proj(owner, "Client A");
    const email = uniqueEmail("guest");
    const inv = await members.inviteMember(owner, {
      email,
      role: "viewer",
      projectIds: [p.id],
    });

    // Preview hides the address.
    const preview = await members.getInvitePreview(inv.id);
    expect(preview).toMatchObject({ status: "pending", role: "viewer" });
    expect((preview as { maskedEmail: string }).maskedEmail).not.toContain(email.split("@")[0]!);
    expect(await members.getInvitePreview("nope")).toEqual({ status: "invalid" });

    const stranger = await signUp("Stranger");
    headerState.current = stranger.headers;
    await expect(
      members.acceptInvitation(asUser(stranger), { invitationId: inv.id }),
    ).rejects.toMatchObject({ code: "wrong_recipient" });
    expect(
      await mongoose.connection.collection("member").countDocuments({ organizationId: t.orgId }),
    ).toBe(1);

    const guest = await signUp("Guest", email);
    headerState.current = guest.headers;
    const joined = await members.acceptInvitation(asUser(guest), { invitationId: inv.id });
    expect(joined).toMatchObject({ orgSlug: t.slug, orgId: t.orgId.toHexString() });

    const guestCtx = await t.ctxOf(guest);
    expect(guestCtx.role).toBe("viewer");
    expect(guestCtx.projectScope).toEqual([p.id]);
    expect(
      await models.AuditLogModel.countDocuments({ orgId: t.orgId, action: "member.joined" }),
    ).toBe(1);

    headerState.current = guest.headers;
    await expect(
      members.acceptInvitation(asUser(guest), { invitationId: inv.id }),
    ).rejects.toMatchObject({ code: "invitation_used" });

    // Expired invitations can't be accepted.
    const late = uniqueEmail("late");
    const lateInv = await members.inviteMember(await t.ctx(), {
      email: late,
      role: "viewer",
      projectIds: [],
    });
    await mongoose.connection
      .collection("invitation")
      .updateOne(
        { _id: new Types.ObjectId(lateInv.id) },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );
    const lateUser = await signUp("Late", late);
    headerState.current = lateUser.headers;
    await expect(
      members.acceptInvitation(asUser(lateUser), { invitationId: lateInv.id }),
    ).rejects.toMatchObject({ code: "invitation_expired" });
    expect(await members.getInvitePreview(lateInv.id)).toMatchObject({ status: "expired" });
  });

  it("scoped invites are rejected on plans without scopes and for admin roles", async () => {
    const free = await newOrg("pro");
    const fctx = await free.ctx();
    const p = await proj(fctx, "P");
    await expect(
      members.inviteMember(fctx, { email: uniqueEmail("s"), role: "viewer", projectIds: [p.id] }),
    ).rejects.toMatchObject({ code: "plan_feature_locked" });

    const t = await newOrg("team");
    const ctx = await t.ctx();
    const tp = await proj(ctx, "P");
    await expect(
      members.inviteMember(ctx, { email: uniqueEmail("s"), role: "admin", projectIds: [tp.id] }),
    ).rejects.toMatchObject({ code: "scope_not_allowed" });
    const other = await newOrg("team");
    const foreign = await proj(await other.ctx(), "Foreign");
    await expect(
      members.inviteMember(await t.ctx(), {
        email: uniqueEmail("s"),
        role: "viewer",
        projectIds: [foreign.id],
      }),
    ).rejects.toBeInstanceOf(refs.RefError);
  });

  it("the plan's seat limit also holds when accepting", async () => {
    const t = await newOrg("team");
    const owner = await t.ctx();
    const email = uniqueEmail("late");
    const inv = await members.inviteMember(owner, { email, role: "viewer", projectIds: [] });
    // Plan drops to Free (2 seats) and the seats fill up before the invitee accepts.
    await models.OrgSettingsModel.updateOne({ orgId: t.orgId }, { plan: "free" });
    await t.addMember("viewer");
    const user = await signUp("Late", email);
    headerState.current = user.headers;
    await expect(
      members.acceptInvitation(asUser(user), { invitationId: inv.id }),
    ).rejects.toMatchObject({
      code: "forbidden",
      message: expect.stringMatching(/membership limit/i),
    });
  });
});
