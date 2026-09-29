import type { Types } from "mongoose";
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
let route: typeof import("@/app/api/v1/contacts/route");
let sync: typeof import("@/lib/services/sync");

beforeAll(async () => {
  ({ stop } = await startTestDb("api-v1-contacts"));
  m = await loadMail();
  route = await import("@/app/api/v1/contacts/route");
  sync = await import("@/lib/services/sync");
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

beforeEach(() => {
  m.fake.resetFakeResend();
  dal.resolve = () => ({ status: "unauthenticated" });
});

async function seeded(): Promise<Seed> {
  const seed = await seedOrg(m);
  await sync.runSyncInline({ connectionId: seed.connectionId.toHexString(), trigger: "manual" });
  return seed;
}

function actAs(
  slug: string,
  orgId: Types.ObjectId,
  role: "owner" | "viewer" | "support" = "owner",
) {
  const ctx = ctxFor(m, orgId, role);
  dal.resolve = (requested) =>
    requested === slug ? { status: "ok", ctx } : { status: "not_member" };
}

const get = (query: string) => route.GET(new Request(`http://localhost/api/v1/contacts?${query}`));

describe("GET /api/v1/contacts", () => {
  it("answers 401 without a session, 404 for a non-member, 400 without orgSlug and for bad queries", async () => {
    const seed = await seeded();
    expect((await get("orgSlug=acme")).status).toBe(401);
    actAs("mine", seed.orgId);
    const outsider = await get("orgSlug=someone-elses");
    expect(outsider.status).toBe(404);
    expect(await outsider.json()).toMatchObject({ error: "not_found" });
    expect((await get("")).status).toBe(400);
    for (const query of ["limit=0", "limit=500", "segmentId=nope", "status=maybe"]) {
      const res = await get(`orgSlug=mine&${query}`);
      expect(res.status, query).toBe(400);
    }
  });

  it("pages through contacts with a cursor and applies filters", async () => {
    const seed = await seeded();
    actAs("mine", seed.orgId);
    const first = await (await get("orgSlug=mine&limit=5")).json();
    expect(first.items).toHaveLength(5);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await (
      await get(`orgSlug=mine&limit=5&cursor=${encodeURIComponent(first.nextCursor)}`)
    ).json();
    const third = await (
      await get(`orgSlug=mine&limit=5&cursor=${encodeURIComponent(second.nextCursor)}`)
    ).json();
    expect(third.items).toHaveLength(2);
    expect(third.nextCursor).toBeNull();

    const found = await (await get("orgSlug=mine&q=person4@")).json();
    expect(found.items.map((c: { email: string }) => c.email)).toEqual([
      expect.stringContaining("person4@"),
    ]);
    const unsub = await (await get("orgSlug=mine&status=unsubscribed")).json();
    expect(unsub.items.length).toBeGreaterThan(0);
    expect(unsub.items.every((c: { unsubscribed: boolean }) => c.unsubscribed)).toBe(true);
    expect(await (await get("orgSlug=mine&cursor=garbage")).json()).toMatchObject({
      error: "validation",
    });
  });

  it("never returns another org's contacts, even when asked by connection or segment id", async () => {
    const mine = await seeded();
    const theirs = await seeded();
    actAs("mine", mine.orgId);
    const own = await (await get("orgSlug=mine&limit=100")).json();
    const myIds = new Set(
      (await m.models.ContactModel.find({ orgId: mine.orgId }, { _id: 1 })).map((c) =>
        String(c._id),
      ),
    );
    expect(own.items).toHaveLength(12);
    expect(own.items.every((c: { id: string }) => myIds.has(c.id))).toBe(true);

    const byConnection = await (
      await get(`orgSlug=mine&connectionId=${theirs.connectionId}`)
    ).json();
    expect(byConnection.items).toEqual([]);
    const foreignSegment = (await m.models.SegmentModel.findOne({ orgId: theirs.orgId }))!;
    const bySegment = await (await get(`orgSlug=mine&segmentId=${foreignSegment._id}`)).json();
    expect(bySegment.items).toEqual([]);
  });

  it("is forbidden for a role that cannot read contacts, allowed for support", async () => {
    const seed = await seeded();
    actAs("mine", seed.orgId, "viewer");
    const denied = await get("orgSlug=mine");
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: "forbidden" });
    actAs("mine", seed.orgId, "support");
    expect((await get("orgSlug=mine&limit=3")).status).toBe(200);
  });
});
