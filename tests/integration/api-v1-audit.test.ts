import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { startTestDb } from "./helpers";
import { ctxFor, loadMail, seedOrg, type Mail, type Seed } from "./mail-helpers";

type Ctx = import("@/lib/dal").OrgContext;
type Resolution =
  { status: "unauthenticated" } | { status: "not_member" } | { status: "ok"; ctx: Ctx };

// Only the session/membership lookup is replaced: the route, service and database are real.
const dal = vi.hoisted(() => ({
  resolve: ((): Resolution => ({ status: "unauthenticated" })) as (slug: string) => Resolution,
}));
vi.mock("@/lib/dal", () => {
  class ForbiddenError extends Error {
    readonly code = "forbidden";
  }
  return {
    ForbiddenError,
    getOrgContext: async (slug: string) => dal.resolve(slug),
    authorize: (ctx: { can: (p: string) => boolean }, permission: string) => {
      if (!ctx.can(permission)) throw new ForbiddenError("nope");
    },
  };
});

let stop: () => Promise<void>;
let m: Mail;
let route: typeof import("@/app/api/v1/audit/route");
let exportRoute: typeof import("@/app/api/v1/audit/export/route");
let csvCell: typeof import("@/lib/services/audit-log-read").csvCell;

beforeAll(async () => {
  ({ stop } = await startTestDb("api-v1-audit"));
  m = await loadMail();
  route = await import("@/app/api/v1/audit/route");
  exportRoute = await import("@/app/api/v1/audit/export/route");
  csvCell = (await import("@/lib/services/audit-log-read")).csvCell;
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

beforeEach(() => {
  dal.resolve = () => ({ status: "unauthenticated" });
});

const DAY = 86_400_000;

async function teamOrg(plan: "free" | "pro" | "team" | "agency" = "team"): Promise<Seed> {
  const seed = await seedOrg(m, { plan: "pro" });
  await m.models.OrgSettingsModel.updateOne({ orgId: seed.orgId }, { plan });
  return seed;
}

async function log(
  orgId: Types.ObjectId,
  action: string,
  extra: {
    ageDays?: number;
    actorId?: Types.ObjectId | null;
    targetType?: string;
    changes?: object;
  } = {},
) {
  const doc = await m.models.AuditLogModel.create({
    orgId,
    actorType: extra.actorId === null ? "system" : "user",
    actorId: extra.actorId === null ? null : (extra.actorId ?? new Types.ObjectId()),
    action,
    target: { type: extra.targetType ?? "connection", id: new Types.ObjectId() },
    changes: extra.changes,
  });
  if (extra.ageDays) {
    await m.models.AuditLogModel.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt: new Date(Date.now() - extra.ageDays * DAY) } },
    );
  }
  return doc;
}

function actAs(slug: string, orgId: Types.ObjectId, role: Parameters<typeof ctxFor>[2] = "owner") {
  const ctx = ctxFor(m, orgId, role);
  dal.resolve = (requested) =>
    requested === slug ? { status: "ok", ctx } : { status: "not_member" };
}

const get = (query: string) => route.GET(new Request(`http://localhost/api/v1/audit?${query}`));
const csv = (query: string) =>
  exportRoute.GET(new Request(`http://localhost/api/v1/audit/export?${query}`));

describe("GET /api/v1/audit", () => {
  it("answers 401 without a session, 404 for a non-member and 400 for bad parameters", async () => {
    const seed = await teamOrg();
    expect((await get("orgSlug=acme")).status).toBe(401);
    actAs("mine", seed.orgId);
    expect((await get("orgSlug=other")).status).toBe(404);
    expect((await get("")).status).toBe(400);
    for (const q of ["limit=0", "limit=1000", "actor=nope", "from=yesterday", "cursor=%20"]) {
      expect((await get(`orgSlug=mine&${q}`)).status, q).toBe(400);
    }
    expect((await get("orgSlug=mine&cursor=bm90LWEtY3Vyc29y")).status).toBe(400);
  });

  it("needs auditLog:read: Owners and Admins only", async () => {
    const seed = await teamOrg();
    await log(seed.orgId, "connection.created");
    for (const role of ["developer", "support", "viewer"] as const) {
      actAs("mine", seed.orgId, role);
      expect((await get("orgSlug=mine")).status, role).toBe(403);
      expect((await csv("orgSlug=mine")).status, `${role} export`).toBe(403);
    }
    for (const role of ["owner", "admin"] as const) {
      actAs("mine", seed.orgId, role);
      expect((await get("orgSlug=mine")).status, role).toBe(200);
    }
  });

  it("is a Team and Agency feature: Free and Pro are refused with the plan message", async () => {
    for (const plan of ["free", "pro"] as const) {
      const seed = await teamOrg(plan);
      await log(seed.orgId, "connection.created");
      actAs("mine", seed.orgId);
      const res = await get("orgSlug=mine");
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        error: "plan_feature_locked",
        message: expect.stringContaining("Team and above"),
      });
      expect((await csv("orgSlug=mine")).status).toBe(403);
    }
    const agency = await teamOrg("agency");
    actAs("mine", agency.orgId);
    expect((await get("orgSlug=mine")).status).toBe(200);
  });

  it("never returns another org's entries, whatever the filters or cursor", async () => {
    const a = await teamOrg();
    const b = await teamOrg();
    const bActor = new Types.ObjectId();
    for (let i = 0; i < 4; i++) await log(a.orgId, "connection.created");
    for (let i = 0; i < 4; i++) await log(b.orgId, "member.invited", { actorId: bActor });

    actAs("mine", a.orgId);
    const all = await (await get("orgSlug=mine&limit=100")).json();
    expect(all.items).toHaveLength(4);
    expect(all.items.every((i: { action: string }) => i.action === "connection.created")).toBe(
      true,
    );

    const byForeignActor = await (await get(`orgSlug=mine&actor=${bActor}`)).json();
    expect(byForeignActor.items).toHaveLength(0);
    const byForeignAction = await (await get("orgSlug=mine&action=member.invited")).json();
    expect(byForeignAction.items).toHaveLength(0);

    // A cursor minted in org B does not open org B's rows in org A.
    actAs("theirs", b.orgId);
    const bPage = await (await get("orgSlug=theirs&limit=2")).json();
    expect(bPage.nextCursor).toBeTruthy();
    actAs("mine", a.orgId);
    const forged = await (
      await get(`orgSlug=mine&limit=100&cursor=${encodeURIComponent(bPage.nextCursor)}`)
    ).json();
    expect(forged.items.every((i: { action: string }) => i.action === "connection.created")).toBe(
      true,
    );

    // Exports are scoped the same way.
    const text = await (await csv("orgSlug=mine")).text();
    expect(text).toContain("connection.created");
    expect(text).not.toContain("member.invited");
  });

  it("pages newest first with a cursor, without gaps or repeats", async () => {
    const seed = await teamOrg();
    for (let i = 0; i < 7; i++) await log(seed.orgId, `thing.${i}`, { ageDays: 7 - i });
    // Same timestamp: the id breaks the tie.
    const t = new Date(Date.now() - 100);
    for (let i = 0; i < 3; i++) {
      const d = await log(seed.orgId, `tie.${i}`);
      await m.models.AuditLogModel.collection.updateOne({ _id: d._id }, { $set: { createdAt: t } });
    }
    actAs("mine", seed.orgId);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: { items: { id: string; action: string }[]; nextCursor: string | null } = await (
        await get(`orgSlug=mine&limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)
      ).json();
      seen.push(...res.items.map((i) => i.id));
      cursor = res.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(4);
    expect(seen).toHaveLength(10);
    expect(new Set(seen).size).toBe(10);
    const first = await (await get("orgSlug=mine&limit=100")).json();
    expect(first.items.map((i: { id: string }) => i.id)).toEqual(seen);
    expect(first.items.at(-1).action).toBe("thing.0");
  });

  it("filters by actor, action (exact or prefix), resource and date, and names the actor", async () => {
    const seed = await teamOrg();
    const { default: mongoose } = await import("mongoose");
    const jane = new Types.ObjectId();
    await mongoose.connection
      .collection("user")
      .insertOne({ _id: jane, name: "Jane Admin", email: `jane${jane}@x.test` });
    await log(seed.orgId, "member.invited", { actorId: jane, targetType: "invitation" });
    await log(seed.orgId, "member.removed", { actorId: jane, targetType: "member", ageDays: 10 });
    await log(seed.orgId, "connection.created", { targetType: "connection", ageDays: 2 });
    await log(seed.orgId, "plan.changed", {
      actorId: null,
      targetType: "organization",
      ageDays: 3,
    });
    actAs("mine", seed.orgId);
    const q = async (query: string) =>
      (await (await get(`orgSlug=mine&${query}`)).json()).items as {
        action: string;
        actor: { name: string; type: string };
      }[];

    expect((await q(`actor=${jane}`)).map((i) => i.action).sort()).toEqual([
      "member.invited",
      "member.removed",
    ]);
    expect((await q(`actor=${jane}`))[0]!.actor.name).toBe("Jane Admin");
    expect(await q("actor=system")).toEqual([
      expect.objectContaining({
        action: "plan.changed",
        actor: expect.objectContaining({ name: "System", type: "system" }),
      }),
    ]);
    expect((await q("action=member.")).map((i) => i.action).sort()).toEqual([
      "member.invited",
      "member.removed",
    ]);
    expect((await q("action=member.invited")).map((i) => i.action)).toEqual(["member.invited"]);
    expect((await q("targetType=connection")).map((i) => i.action)).toEqual(["connection.created"]);
    const day = (ago: number) => new Date(Date.now() - ago * DAY).toISOString().slice(0, 10);
    expect((await q(`from=${day(4)}`)).map((i) => i.action).sort()).toEqual([
      "connection.created",
      "member.invited",
      "plan.changed",
    ]);
    expect((await q(`from=${day(11)}&to=${day(9)}`)).map((i) => i.action)).toEqual([
      "member.removed",
    ]);
    // The "." in a prefix is literal, not a wildcard.
    expect(await q("action=member%2E%2E")).toEqual([]);
    expect(await q("action=m.")).toEqual([]);
  });

  it("only reaches back as far as the plan's window (Team 90 days, Agency 1 year)", async () => {
    const team = await teamOrg("team");
    await log(team.orgId, "recent.thing", { ageDays: 5 });
    await log(team.orgId, "old.thing", { ageDays: 120 });
    actAs("mine", team.orgId);
    expect(
      (await (await get("orgSlug=mine")).json()).items.map((i: { action: string }) => i.action),
    ).toEqual(["recent.thing"]);
    // A `from` before the window cannot widen it.
    const wide = await (await get("orgSlug=mine&from=2000-01-01")).json();
    expect(wide.items).toHaveLength(1);

    const agency = await teamOrg("agency");
    await log(agency.orgId, "old.thing", { ageDays: 120 });
    await log(agency.orgId, "ancient.thing", { ageDays: 400 });
    actAs("mine", agency.orgId);
    expect((await (await get("orgSlug=mine")).json()).items).toHaveLength(1);
  });

  it("returns before/after but no secrets are added by the reader", async () => {
    const seed = await teamOrg();
    await log(seed.orgId, "member.role_changed", {
      changes: { before: { role: "viewer" }, after: { role: "admin" } },
    });
    actAs("mine", seed.orgId);
    const { items } = await (await get("orgSlug=mine")).json();
    expect(items[0].changes).toEqual({ before: { role: "viewer" }, after: { role: "admin" } });
  });
});

describe("GET /api/v1/audit/export", () => {
  it("downloads a CSV of the filtered entries", async () => {
    const seed = await teamOrg();
    await log(seed.orgId, "member.invited", {
      changes: { after: { email: "a@b.test", role: "viewer" } },
    });
    await log(seed.orgId, "connection.created");
    actAs("mine", seed.orgId);
    const res = await csv("orgSlug=mine&action=member.invited");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(
      /attachment; filename="wisemail-audit-org-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    const lines = (await res.text()).trim().split("\r\n");
    expect(lines[0]).toBe(
      "Time (UTC),Actor,Actor type,Action,Resource,Resource id,Before,After,IP",
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("member.invited");
    expect(lines[1]).toContain('"{""email"":""a@b.test"",""role"":""viewer""}"');
  });

  it("escapes quotes and commas and neutralises spreadsheet formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell(null)).toBe("");
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
});
