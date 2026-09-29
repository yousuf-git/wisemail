import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { startTestDb, uniqueEmail } from "./helpers";

// next/headers is request-scoped; tests drive it by hand.
const headerState = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => headerState.current,
  cookies: async () => ({ set() {}, get() {}, delete() {}, getAll: () => [] }),
}));

let stop: () => Promise<void>;
let auth: typeof import("@/lib/auth/server").auth;
let models: typeof import("@/lib/db/models");
let dal: typeof import("@/lib/dal");
let tenancy: typeof import("@/lib/services/tenancy");
let actionMod: typeof import("@/lib/actions/action");
let connect: typeof import("@/lib/db/connect");
let z: typeof import("zod");

beforeAll(async () => {
  ({ stop } = await startTestDb("auth-org"));
  connect = await import("@/lib/db/connect");
  auth = (await import("@/lib/auth/server")).auth;
  models = await import("@/lib/db/models");
  dal = await import("@/lib/dal");
  tenancy = await import("@/lib/services/tenancy");
  actionMod = await import("@/lib/actions/action");
  z = await import("zod");
  await connect.connectDb();
}, 120_000);

afterAll(async () => {
  await connect?.disconnectDb();
  await stop?.();
});

async function signUp(name: string) {
  const email = uniqueEmail(name.toLowerCase());
  const res = await auth.api.signUpEmail({
    body: { name, email, password: "correct horse battery" },
    returnHeaders: true,
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { id: res.response.user.id, email, headers: new Headers({ cookie }) };
}

async function createOrg(owner: { headers: Headers }, slug: string) {
  return auth.api.createOrganization({
    headers: owner.headers,
    body: { name: `Org ${slug}`, slug },
  });
}

const as = (u: { headers: Headers } | null) => {
  headerState.current = u?.headers ?? new Headers();
};

describe("organization creation", () => {
  it("creates org_settings with defaults and an audit log entry", async () => {
    const owner = await signUp("Olive");
    const org = await createOrg(owner, "olive-co");

    const orgId = new Types.ObjectId(org.id);
    const settings = await models.OrgSettingsModel.findOne({ orgId }).lean();
    expect(settings).toMatchObject({ plan: "free", planState: "free", timezone: "UTC" });
    expect(settings!.ai).toMatchObject({ enabled: false });
    const now = new Date();
    expect(settings!.billingPeriod.start.toISOString()).toBe(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    );
    expect(settings!.billingPeriod.end.getTime()).toBeGreaterThan(now.getTime());

    const logs = await models.AuditLogModel.find({ orgId }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "organization.created", actorType: "user" });
    expect(logs[0]!.actorId!.toHexString()).toBe(owner.id);
  });

  it("stores the creator as owner, with ObjectId references", async () => {
    const owner = await signUp("Otto");
    const org = await createOrg(owner, "otto-co");
    const access = await tenancy.resolveOrgAccess(owner.id, "otto-co");
    expect(access).toMatchObject({ role: "owner", org: { id: org.id, slug: "otto-co" } });
  });

  it("is idempotent: provisioning twice keeps one settings doc and one audit entry", async () => {
    const owner = await signUp("Ida");
    const org = await createOrg(owner, "ida-co");
    const { provisionOrganization } = await import("@/lib/services/org-settings");
    const again = await provisionOrganization({
      orgId: new Types.ObjectId(org.id),
      actorId: new Types.ObjectId(owner.id),
      name: org.name,
      slug: org.slug,
    });
    expect(again.created).toBe(false);
    const orgId = new Types.ObjectId(org.id);
    expect(await models.OrgSettingsModel.countDocuments({ orgId })).toBe(1);
    expect(await models.AuditLogModel.countDocuments({ orgId })).toBe(1);
  });

  it("rejects reserved and malformed slugs, even when calling the endpoint directly", async () => {
    const u = await signUp("Rex");
    await expect(createOrg(u, "api")).rejects.toMatchObject({ statusCode: 400 });
    await expect(createOrg(u, "Bad Slug")).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("requireOrg / getOrgContext", () => {
  it("resolves an org for a member and never for a non-member", async () => {
    const owner = await signUp("Ann");
    const stranger = await signUp("Sid");
    await createOrg(owner, "ann-co");

    as(owner);
    const ok = await dal.requireOrg("ann-co");
    expect(ok.role).toBe("owner");
    expect(ok.org.slug).toBe("ann-co");
    expect(ok.can("billing:manage")).toBe(true);

    // Non-member: same 404 as a missing org.
    as(stranger);
    await expect(dal.requireOrg("ann-co")).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404"),
    });
    await expect(dal.requireOrg("does-not-exist")).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404"),
    });
    expect(await dal.getOrgContext("ann-co")).toEqual({ status: "not_member" });

    // Visitor: redirected to sign-in.
    as(null);
    await expect(dal.requireOrg("ann-co")).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(await dal.getOrgContext("ann-co")).toEqual({ status: "unauthenticated" });
  });

  it("resolveOrgAccess rejects bad user ids and non-members without throwing", async () => {
    expect(await tenancy.resolveOrgAccess("not-an-id", "ann-co")).toBeNull();
    expect(await tenancy.resolveOrgAccess(new Types.ObjectId().toHexString(), "ann-co")).toBeNull();
  });

  it("sets the active organization on the session", async () => {
    const owner = await signUp("Zed");
    const one = await createOrg(owner, "zed-one");
    const two = await createOrg(owner, "zed-two");
    as(owner);
    await dal.requireOrg("zed-one");
    const session = await auth.api.getSession({ headers: owner.headers });
    expect(two.id).not.toBe(one.id);
    expect(session!.session.activeOrganizationId).toBe(one.id);
    expect(await tenancy.listUserOrgs(owner.id)).toHaveLength(2);
  });
});

describe("orgAction", () => {
  const run = vi.fn(async ({ input }: { input: { title: string } }) => ({ echoed: input.title }));
  const action = () =>
    actionMod.orgAction(
      { input: z.z.object({ title: z.z.string().min(2) }), permission: "connection:create" },
      run,
    );

  it("authenticates, authorizes by role, validates, then runs", async () => {
    const owner = await signUp("Ora");
    const viewer = await signUp("Vic");
    const org = await createOrg(owner, "ora-co");
    await auth.api.addMember({
      body: { userId: viewer.id, organizationId: org.id, role: "viewer" },
    });
    const doIt = action();

    as(null);
    expect(await doIt("ora-co", { title: "hi" })).toMatchObject({
      ok: false,
      error: { code: "unauthenticated" },
    });

    as(viewer);
    expect(await doIt("ora-co", { title: "hi" })).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(run).not.toHaveBeenCalled();

    const stranger = await signUp("Sam");
    as(stranger);
    expect(await doIt("ora-co", { title: "hi" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });

    as(owner);
    const bad = await doIt("ora-co", { title: "x" });
    expect(bad).toMatchObject({
      ok: false,
      error: { code: "validation", fieldErrors: { title: [expect.any(String)] } },
    });
    expect(run).not.toHaveBeenCalled();

    expect(await doIt("ora-co", { title: "hello" })).toEqual({
      ok: true,
      data: { echoed: "hello" },
    });
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]![0]).toMatchObject({
      ctx: { org: { slug: "ora-co" }, role: "owner" },
    });
  });
});
