import type { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { startTestDb } from "./helpers";
import { ctxFor, loadMail, seedOrg, storeEvent, type Mail, type Seed } from "./mail-helpers";

type Ctx = import("@/lib/dal").OrgContext;
type Resolution =
  { status: "unauthenticated" } | { status: "not_member" } | { status: "ok"; ctx: Ctx };

// Only the session/membership lookup is replaced: routes, services and the database are real.
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
let threadsRoute: typeof import("@/app/api/v1/threads/route");
let threadRoute: typeof import("@/app/api/v1/threads/[threadId]/route");
let activityRoute: typeof import("@/app/api/v1/activity/route");
let timelineRoute: typeof import("@/app/api/v1/activity/[emailId]/route");

beforeAll(async () => {
  ({ stop } = await startTestDb("api-v1"));
  m = await loadMail();
  threadsRoute = await import("@/app/api/v1/threads/route");
  threadRoute = await import("@/app/api/v1/threads/[threadId]/route");
  activityRoute = await import("@/app/api/v1/activity/route");
  timelineRoute = await import("@/app/api/v1/activity/[emailId]/route");
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

beforeEach(() => {
  m.fake.resetFakeResend();
  dal.resolve = () => ({ status: "unauthenticated" });
});

async function receive(seed: Seed, subject: string, from: string) {
  const inbound = m.fake.createFakeReceivedEmail(seed.key, {
    from,
    to: [seed.mailbox],
    subject,
    text: `body of ${subject}`,
  });
  const processed = await m.processing.processWebhookEvent(
    await storeEvent(m, seed, "email.received", inbound.event as never),
  );
  await m.inbound.fetchInboundEmail({ emailId: processed.emailId! });
  const email = await m.models.EmailModel.findById(processed.emailId);
  return { emailId: processed.emailId!, threadId: email!.threadId!.toHexString() };
}

/** Signs in as a member of `orgId` under the slug `slug`; every other slug is a non-member. */
function actAs(slug: string, orgId: Types.ObjectId, role: "owner" | "viewer" = "owner") {
  const ctx = ctxFor(m, orgId, role);
  dal.resolve = (requested) =>
    requested === slug ? { status: "ok", ctx } : { status: "not_member" };
}

const get = (
  handler: (req: Request, ctx: never) => Promise<Response> | Response,
  path: string,
  params?: Record<string, string>,
) =>
  handler(new Request(`http://localhost${path}`), {
    params: Promise.resolve(params ?? {}),
  } as never);

describe("/api/v1 authentication", () => {
  it("answers 401 without a session, 404 for a non-member and 400 without orgSlug", async () => {
    const seed = await seedOrg(m);
    const anonymous = await get(threadsRoute.GET, "/api/v1/threads?orgSlug=acme");
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("cache-control")).toContain("no-store");

    actAs("mine", seed.orgId);
    const outsider = await get(threadsRoute.GET, "/api/v1/threads?orgSlug=someone-elses");
    expect(outsider.status).toBe(404);
    expect(await outsider.json()).toMatchObject({ error: "not_found" });

    expect((await get(threadsRoute.GET, "/api/v1/threads")).status).toBe(400);
    expect((await get(activityRoute.GET, "/api/v1/activity?orgSlug=someone-elses")).status).toBe(
      404,
    );
  });

  it("validates the query with Zod", async () => {
    const seed = await seedOrg(m);
    actAs("mine", seed.orgId);
    for (const query of ["limit=0", "limit=500", "folder=drafts", "projectId=nope"]) {
      const res = await get(threadsRoute.GET, `/api/v1/threads?orgSlug=mine&${query}`);
      expect(res.status, query).toBe(400);
      expect(await res.json()).toMatchObject({ error: "validation" });
    }
    const bad = await get(activityRoute.GET, "/api/v1/activity?orgSlug=mine&status=exploded");
    expect(bad.status).toBe(400);
  });
});

describe("GET /api/v1/threads", () => {
  it("paginates with a cursor and never returns another org's threads", async () => {
    const mine = await seedOrg(m);
    const theirs = await seedOrg(m);
    await receive(mine, "First", "a@customer.test");
    await receive(mine, "Second", "b@customer.test");
    await receive(mine, "Third", "c@customer.test");
    const foreign = await receive(theirs, "Secret", "spy@customer.test");

    actAs("mine", mine.orgId);
    const page1 = await (
      await get(threadsRoute.GET, "/api/v1/threads?orgSlug=mine&limit=2")
    ).json();
    expect(page1.items.map((i: { subject: string }) => i.subject)).toEqual(["Third", "Second"]);
    expect(page1.nextCursor).toEqual(expect.any(String));

    const page2 = await (
      await get(
        threadsRoute.GET,
        `/api/v1/threads?orgSlug=mine&limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
      )
    ).json();
    expect(page2.items.map((i: { subject: string }) => i.subject)).toEqual(["First"]);
    expect(page2.nextCursor).toBeNull();

    const all = [...page1.items, ...page2.items] as { id: string; subject: string }[];
    expect(all.some((i) => i.id === foreign.threadId || i.subject === "Secret")).toBe(false);
  });

  it("filters by search text and unread", async () => {
    const seed = await seedOrg(m);
    await receive(seed, "Invoice question", "jane@customer.test");
    await receive(seed, "Partnership intro", "marco@customer.test");
    actAs("mine", seed.orgId);
    const found = await (
      await get(threadsRoute.GET, "/api/v1/threads?orgSlug=mine&q=invoice")
    ).json();
    expect(found.items.map((i: { subject: string }) => i.subject)).toEqual(["Invoice question"]);
    const unread = await (
      await get(threadsRoute.GET, "/api/v1/threads?orgSlug=mine&unread=1")
    ).json();
    expect(unread.items).toHaveLength(2);
  });

  it("returns a thread only inside its own org", async () => {
    const mine = await seedOrg(m);
    const theirs = await seedOrg(m);
    const own = await receive(mine, "Mine", "a@customer.test");
    const foreign = await receive(theirs, "Theirs", "b@customer.test");
    actAs("mine", mine.orgId);

    const ok = await get(threadRoute.GET, `/api/v1/threads/${own.threadId}?orgSlug=mine`, {
      threadId: own.threadId,
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ id: own.threadId, subject: "Mine" });

    const crossOrg = await get(
      threadRoute.GET,
      `/api/v1/threads/${foreign.threadId}?orgSlug=mine`,
      { threadId: foreign.threadId },
    );
    expect(crossOrg.status).toBe(404);
    const junk = await get(threadRoute.GET, "/api/v1/threads/not-an-id?orgSlug=mine", {
      threadId: "not-an-id",
    });
    expect(junk.status).toBe(404);
  });
});

describe("GET /api/v1/activity", () => {
  it("paginates, filters and hides other orgs' emails and timelines", async () => {
    const mine = await seedOrg(m);
    const theirs = await seedOrg(m);
    const a = await receive(mine, "One", "a@customer.test");
    await receive(mine, "Two", "b@customer.test");
    await receive(mine, "Three", "c@customer.test");
    const foreign = await receive(theirs, "Not yours", "spy@customer.test");
    actAs("mine", mine.orgId);

    const page1 = await (
      await get(activityRoute.GET, "/api/v1/activity?orgSlug=mine&limit=2")
    ).json();
    expect(page1.items).toHaveLength(2);
    const page2 = await (
      await get(
        activityRoute.GET,
        `/api/v1/activity?orgSlug=mine&limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
      )
    ).json();
    expect(page2.items).toHaveLength(1);
    const ids = [...page1.items, ...page2.items].map((i: { id: string }) => i.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).not.toContain(foreign.emailId);

    const inbound = await (
      await get(
        activityRoute.GET,
        "/api/v1/activity?orgSlug=mine&direction=inbound&status=received",
      )
    ).json();
    expect(inbound.items).toHaveLength(3);
    const none = await (
      await get(activityRoute.GET, "/api/v1/activity?orgSlug=mine&direction=outbound")
    ).json();
    expect(none.items).toHaveLength(0);
    const byAddress = await (
      await get(activityRoute.GET, "/api/v1/activity?orgSlug=mine&recipient=a@customer.test")
    ).json();
    expect(byAddress.items.map((i: { id: string }) => i.id)).toEqual([a.emailId]);

    const timeline = await get(timelineRoute.GET, `/api/v1/activity/${a.emailId}?orgSlug=mine`, {
      emailId: a.emailId,
    });
    expect(timeline.status).toBe(200);
    expect((await timeline.json()).email.id).toBe(a.emailId);
    const crossOrg = await get(
      timelineRoute.GET,
      `/api/v1/activity/${foreign.emailId}?orgSlug=mine`,
      { emailId: foreign.emailId },
    );
    expect(crossOrg.status).toBe(404);
  });
});
