import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { startTestDb } from "./helpers";

type Resolution =
  { status: "unauthenticated" } | { status: "not_member" } | { status: "ok"; ctx: unknown };
const dal = vi.hoisted(() => ({
  resolve: ((): Resolution => ({ status: "unauthenticated" })) as (slug: string) => Resolution,
}));
vi.mock("@/lib/dal", () => ({ getOrgContext: async (slug: string) => dal.resolve(slug) }));

let stop: () => Promise<void>;
let hubMod: typeof import("@/lib/realtime/hub");
let streamMod: typeof import("@/lib/realtime/stream");
let publishMod: typeof import("@/lib/realtime/publish");
let route: typeof import("@/app/api/stream/route");
let connect: typeof import("@/lib/db/connect");
let RealtimeEventModel: typeof import("@/lib/db/models/realtime-event").RealtimeEventModel;

beforeAll(async () => {
  ({ stop } = await startTestDb("realtime"));
  hubMod = await import("@/lib/realtime/hub");
  streamMod = await import("@/lib/realtime/stream");
  publishMod = await import("@/lib/realtime/publish");
  route = await import("@/app/api/stream/route");
  connect = await import("@/lib/db/connect");
  ({ RealtimeEventModel } = await import("@/lib/db/models/realtime-event"));
  await connect.connectDb();
  await RealtimeEventModel.init();
}, 120_000);

afterAll(async () => {
  await connect?.disconnectDb();
  await stop?.();
});

const id = () => new Types.ObjectId();
const hex = (o: Types.ObjectId) => o.toHexString();

/** Waits until `check` passes (events cross a change stream, so delivery is asynchronous). */
async function eventually(check: () => void, timeoutMs = 8000) {
  const start = Date.now();
  for (;;) {
    try {
      return check();
    } catch (error) {
      if (Date.now() - start > timeoutMs) throw error;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

function collector(sub: {
  orgId: Types.ObjectId;
  userId?: Types.ObjectId;
  scope?: Types.ObjectId[] | null;
}) {
  const received: import("@/lib/realtime/hub").HubEvent[] = [];
  const subscriber: import("@/lib/realtime/hub").HubSubscriber = {
    orgId: hex(sub.orgId),
    userId: hex(sub.userId ?? id()),
    projectScope: sub.scope ? sub.scope.map(hex) : null,
    send: (e) => received.push(e),
  };
  return { received, subscriber };
}

describe.each(["changestream", "poll"] as const)("RealtimeHub (%s)", (mode) => {
  it("fans out by org, user and project scope", async () => {
    const hub = new hubMod.RealtimeHub({ mode, pollMs: 50, idleCloseMs: 0 });
    const orgA = id();
    const orgB = id();
    const alice = id();
    const bob = id();
    const projectX = id();
    const projectY = id();

    const a = collector({ orgId: orgA, userId: alice });
    const b = collector({ orgId: orgB });
    const scoped = collector({ orgId: orgA, userId: bob, scope: [projectX] });
    const unsubs = await Promise.all([a, b, scoped].map((c) => hub.subscribe(c.subscriber)));
    expect(hub.mode).toBe(mode);

    const { publish } = publishMod;
    await publish({ orgId: orgA, topics: ["threads"] });
    await publish({ orgId: orgA, projectId: projectX, topics: ["emails"] });
    await publish({ orgId: orgA, projectId: projectY, topics: ["domains"] });
    await publish({ orgId: orgA, userId: alice, topics: ["notifications:alice"] });
    await publish({ orgId: orgA, userId: bob, topics: ["notifications:bob"] });
    await publish({ orgId: orgB, topics: ["connections"] });

    const topicsOf = (c: { received: { topics: string[] }[] }) =>
      c.received.flatMap((e) => e.topics).sort();
    await eventually(() => expect(a.received.length).toBe(4));
    await eventually(() => expect(b.received.length).toBe(1));
    await eventually(() => expect(scoped.received.length).toBe(3));

    // Org A unrestricted member: everything in org A, but not bob's notification; never org B.
    expect(topicsOf(a)).toEqual(["threads", "emails", "domains", "notifications:alice"].sort());
    expect(topicsOf(a)).not.toContain("connections");
    // Other org only sees its own event.
    expect(topicsOf(b)).toEqual(["connections"]);
    // Scoped member: org-wide (null project) + project X + own notification, not project Y, not alice's.
    expect(topicsOf(scoped)).toEqual(["threads", "emails", "notifications:bob"].sort());

    unsubs.forEach((u) => u());
    expect(hub.size).toBe(0);
    await hub.stop();
  }, 30_000);

  it("stops the source after the last subscriber leaves", async () => {
    const hub = new hubMod.RealtimeHub({ mode, pollMs: 50, idleCloseMs: 0 });
    const c = collector({ orgId: id() });
    const unsub = await hub.subscribe(c.subscriber);
    expect(hub.mode).toBe(mode);
    unsub();
    await eventually(() => expect(hub.mode).toBeNull());
  });
});

describe("isVisibleTo", () => {
  it("applies org, user and project rules", () => {
    const { isVisibleTo } = hubMod;
    const org = hex(id());
    const project = hex(id());
    const sub = { orgId: org, userId: "u1", projectScope: [project] as string[] | null };
    const event = { orgId: org, projectId: null, userId: null };
    expect(isVisibleTo(event, sub)).toBe(true);
    expect(isVisibleTo({ ...event, orgId: hex(id()) }, sub)).toBe(false);
    expect(isVisibleTo({ ...event, userId: "u2" }, sub)).toBe(false);
    expect(isVisibleTo({ ...event, userId: "u1" }, sub)).toBe(true);
    expect(isVisibleTo({ ...event, projectId: project }, sub)).toBe(true);
    expect(isVisibleTo({ ...event, projectId: hex(id()) }, sub)).toBe(false);
    expect(isVisibleTo({ ...event, projectId: hex(id()) }, { ...sub, projectScope: null })).toBe(
      true,
    );
  });
});

type Frame = { id?: string; event?: string; data?: string };

/** Reads SSE frames from a stream until `until` says stop (or the timeout). */
async function readFrames(
  body: ReadableStream<Uint8Array>,
  until: (frames: Frame[]) => boolean,
  timeoutMs = 8000,
): Promise<Frame[]> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const frames: Frame[] = [];
  let buffer = "";
  const deadline = Date.now() + timeoutMs;
  let pending: ReturnType<typeof reader.read> | null = null;
  while (Date.now() < deadline && !until(frames)) {
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 200));
    pending ??= reader.read();
    const chunk = await Promise.race([pending, timeout]);
    if (!chunk) continue; // keep the same pending read: dropping it would lose its chunk
    pending = null;
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const frame: Frame = {};
      for (const line of raw.split("\n")) {
        if (line.startsWith("id: ")) frame.id = line.slice(4);
        else if (line.startsWith("event: ")) frame.event = line.slice(7);
        else if (line.startsWith("data: ")) frame.data = line.slice(6);
      }
      if (frame.event || frame.id) frames.push(frame);
    }
  }
  await reader.cancel().catch(() => undefined);
  return frames;
}

describe("event stream", () => {
  it("replays events after Last-Event-ID for the org, filtered, then goes live", async () => {
    const hub = new hubMod.RealtimeHub({ mode: "poll", pollMs: 50, idleCloseMs: 0 });
    const org = id();
    const other = id();
    const user = id();
    const project = id();
    const { publish } = publishMod;

    await publish({ orgId: org, topics: ["seen-before"] });
    const first = await RealtimeEventModel.findOne({ orgId: org }).lean();
    await publish({ orgId: org, topics: ["missed-1"] });
    await publish({ orgId: other, topics: ["other-org"] });
    await publish({ orgId: org, projectId: project, topics: ["other-project"] });
    await publish({ orgId: org, userId: id(), topics: ["someone-elses"] });
    await publish({ orgId: org, topics: ["missed-2"] });

    const body = await streamMod.openEventStream({
      orgId: hex(org),
      userId: hex(user),
      projectScope: [hex(id())],
      lastEventId: hex(first!._id),
      hub,
    });
    const controller = new AbortController();
    const framesPromise = readFrames(body, (f) =>
      f.some((x) => x.event === "invalidate" && x.data?.includes("live-now")),
    );
    await new Promise((r) => setTimeout(r, 300));
    await publish({ orgId: org, topics: ["live-now"] });
    const frames = await framesPromise;
    controller.abort();

    const invalidated = frames
      .filter((f) => f.event === "invalidate")
      .map((f) => (JSON.parse(f.data!) as { topics: string[] }).topics[0]);
    // Project-scoped member sees org-wide events only; never other orgs, other users' events.
    expect(invalidated).toEqual(["missed-1", "missed-2", "live-now"]);
    // Every invalidate carries the event id, ready carries a replay cursor.
    expect(
      frames
        .filter((f) => f.event === "invalidate")
        .every((f) => /^[0-9a-f]{24}$/.test(f.id ?? "")),
    ).toBe(true);
    expect(frames.find((f) => f.event === "ready")?.id).toMatch(/^[0-9a-f]{24}$/);
    await hub.stop();
  }, 30_000);

  it("sends resync when the cursor is older than the retention window", async () => {
    const hub = new hubMod.RealtimeHub({ mode: "poll", pollMs: 50, idleCloseMs: 0 });
    const old = Types.ObjectId.createFromTime(Math.floor(Date.now() / 1000) - 2 * 3600);
    const body = await streamMod.openEventStream({
      orgId: hex(id()),
      userId: hex(id()),
      projectScope: null,
      lastEventId: hex(old),
      hub,
    });
    const frames = await readFrames(body, (f) => f.some((x) => x.event === "ready"));
    expect(frames.map((f) => f.event)).toContain("resync");
    await hub.stop();
  }, 15_000);

  it("resyncs when the replay is larger than the limit", async () => {
    const hub = new hubMod.RealtimeHub({ mode: "poll", pollMs: 50, idleCloseMs: 0 });
    const org = id();
    const start = Types.ObjectId.createFromTime(Math.floor(Date.now() / 1000) - 5);
    for (let i = 0; i < 4; i++) await publishMod.publish({ orgId: org, topics: [`t${i}`] });
    const body = await streamMod.openEventStream({
      orgId: hex(org),
      userId: hex(id()),
      projectScope: null,
      lastEventId: hex(start),
      replayLimit: 2,
      hub,
    });
    const frames = await readFrames(body, (f) => f.some((x) => x.event === "ready"));
    expect(frames.filter((f) => f.event === "invalidate")).toHaveLength(2);
    expect(frames.map((f) => f.event)).toContain("resync");
    await hub.stop();
  }, 15_000);

  it("sends heartbeats and closes at its deadline", async () => {
    const hub = new hubMod.RealtimeHub({ mode: "poll", pollMs: 50, idleCloseMs: 0 });
    const body = await streamMod.openEventStream({
      orgId: hex(id()),
      userId: hex(id()),
      projectScope: null,
      heartbeatMs: 50,
      maxDurationMs: 10_300,
      hub,
    });
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline && !text.includes(": hb")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value);
    }
    expect(text).toContain(": hb");
    await reader.cancel();
    await hub.stop();
  }, 15_000);

  it("closes and unsubscribes when the request is aborted", async () => {
    const hub = new hubMod.RealtimeHub({ mode: "poll", pollMs: 50, idleCloseMs: 0 });
    const controller = new AbortController();
    const body = await streamMod.openEventStream({
      orgId: hex(id()),
      userId: hex(id()),
      projectScope: null,
      signal: controller.signal,
      hub,
    });
    expect(hub.size).toBe(1);
    controller.abort();
    const reader = body.getReader();
    let done = false;
    for (let i = 0; i < 20 && !done; i++) done = (await reader.read()).done;
    expect(done).toBe(true);
    await eventually(() => expect(hub.size).toBe(0));
    await hub.stop();
  });
});

describe("GET /api/stream", () => {
  const request = (query: string, headers: Record<string, string> = {}) =>
    new Request(`http://localhost/api/stream${query}`, { headers });

  it("answers 400 without orgSlug, 401 without a session, 404 for non-members", async () => {
    expect((await route.GET(request(""))).status).toBe(400);

    dal.resolve = () => ({ status: "unauthenticated" });
    const unauth = await route.GET(request("?orgSlug=acme"));
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get("cache-control")).toContain("no-store");

    dal.resolve = () => ({ status: "not_member" });
    expect((await route.GET(request("?orgSlug=acme"))).status).toBe(404);
  });

  it("streams as text/event-stream with no caching for a member", async () => {
    const org = id();
    const ctx = {
      user: { id: hex(id()), name: "A", email: "a@x.com", image: null },
      org: { id: hex(org), name: "Org", slug: "acme" },
      projectScope: null,
    };
    dal.resolve = () => ({ status: "ok", ctx });
    const controller = new AbortController();
    const response = await route.GET(
      new Request("http://localhost/api/stream?orgSlug=acme", { signal: controller.signal }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-cache");
    expect(route.runtime).toBe("nodejs");
    expect(route.maxDuration).toBeLessThanOrEqual(300);
    const frames = await readFrames(response.body!, (f) => f.some((x) => x.event === "ready"));
    expect(frames.some((f) => f.event === "ready")).toBe(true);
    controller.abort();
    await hubMod.getHub().stop();
  }, 15_000);
});
