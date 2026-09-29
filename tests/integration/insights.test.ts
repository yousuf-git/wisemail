import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { startTestDb } from "./helpers";
import { ctxFor, loadMail, seedOrg, type Mail } from "./mail-helpers";

type Ctx = import("@/lib/dal").OrgContext;
type Resolution =
  { status: "unauthenticated" } | { status: "not_member" } | { status: "ok"; ctx: Ctx };
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
let insights: typeof import("@/lib/services/insights");
let rollups: typeof import("@/lib/services/rollups");
let overviewData: typeof import("@/components/app/overview-data");
let overviewModel: typeof import("@/components/app/overview-model");
let route: typeof import("@/app/api/v1/insights/route");

beforeAll(async () => {
  ({ stop } = await startTestDb("insights"));
  m = await loadMail();
  insights = await import("@/lib/services/insights");
  rollups = await import("@/lib/services/rollups");
  overviewData = await import("@/components/app/overview-data");
  overviewModel = await import("@/components/app/overview-model");
  route = await import("@/app/api/v1/insights/route");
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

const NOW = new Date("2026-09-29T12:00:00Z");
const daysAgo = (n: number, hour = 10) => new Date(Date.UTC(2026, 8, 29 - n, hour, 15));

type Seed = Awaited<ReturnType<typeof seedOrg>>;
async function bump(
  seed: Seed,
  at: Date,
  counters: Partial<Record<string, number>>,
  options: {
    stream?: "transactional" | "broadcast" | "inbound";
    domainId?: Types.ObjectId | null;
    projectId?: Types.ObjectId | null;
  } = {},
) {
  await rollups.incrementRollups(
    {
      orgId: seed.orgId,
      connectionId: seed.connectionId,
      domainId: options.domainId === undefined ? seed.domain._id : options.domainId,
      projectId: options.projectId ?? null,
    },
    { at, stream: options.stream ?? "transactional", counters: counters as never },
  );
}

describe("getInsights", () => {
  it("sums counters into totals, rates and a daily series", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId);
    await bump(seed, daysAgo(1), {
      sent: 100,
      delivered: 96,
      opened_unique: 48,
      clicked_unique: 12,
      bounced_hard: 3,
      bounced_soft: 1,
    });
    await bump(seed, daysAgo(2), { sent: 50, delivered: 50, complained: 1 });

    const data = await insights.getInsights(ctx, { days: 7, now: NOW });
    expect(data.hasData).toBe(true);
    expect(data.totals).toMatchObject({
      sent: 150,
      delivered: 146,
      opened: 48,
      clicked: 12,
      bounced: 4,
      complained: 1,
    });
    expect(data.rates.delivered).toBeCloseTo((146 / 150) * 100);
    expect(data.rates.opened).toBeCloseTo((48 / 146) * 100);
    expect(data.rates.bounced).toBeCloseTo((4 / 150) * 100);
    expect(data.series).toHaveLength(7);
    expect(data.series.at(-1)!.date).toBe("2026-09-29");
    expect(data.series.find((p) => p.date === "2026-09-28")!.counts.sent).toBe(100);
    expect(data.series.find((p) => p.date === "2026-09-27")!.counts.sent).toBe(50);
    expect(data.timezone).toBe("UTC");
  });

  it("compares with the previous period", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId);
    await bump(seed, daysAgo(1), { sent: 120, delivered: 108 });
    await bump(seed, daysAgo(9), { sent: 100, delivered: 98 });

    const data = await insights.getInsights(ctx, { days: 7, now: NOW });
    expect(data.previous.counts.sent).toBe(100);
    expect(data.deltas.sent).toBe(20);
    expect(data.deltas.rates.delivered).toBe(-8);
    expect(data.deltas.rates.opened).toBe(0);

    const empty = await insights.getInsights(ctxFor(m, (await seedOrg(m)).orgId), {
      days: 7,
      now: NOW,
    });
    expect(empty.hasData).toBe(false);
    expect(empty.deltas.sent).toBeNull();
  });

  it("cuts days in the org time zone", async () => {
    const seed = await seedOrg(m);
    await m.models.OrgSettingsModel.updateOne(
      { orgId: seed.orgId },
      { $set: { timezone: "Asia/Tokyo" } },
    );
    const ctx = ctxFor(m, seed.orgId);
    // 20:00 UTC on Sep 27 is 05:00 on Sep 28 in Tokyo; 12:00 UTC on Sep 27 is still Sep 27 there.
    await bump(seed, new Date("2026-09-27T20:00:00Z"), { sent: 7 });
    await bump(seed, new Date("2026-09-27T12:00:00Z"), { sent: 3 });

    const data = await insights.getInsights(ctx, { days: 7, now: NOW });
    expect(data.timezone).toBe("Asia/Tokyo");
    expect(data.series.find((p) => p.date === "2026-09-28")!.counts.sent).toBe(7);
    expect(data.series.find((p) => p.date === "2026-09-27")!.counts.sent).toBe(3);
    // "Today" in Tokyo at 12:00 UTC is Sep 29 21:00.
    expect(data.series.at(-1)!.date).toBe("2026-09-29");
  });

  it("uses daily buckets (UTC days) for 90 days", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId);
    await bump(seed, daysAgo(60), { sent: 40, delivered: 40 });
    const data = await insights.getInsights(ctx, { days: 90, now: NOW });
    expect(data.series).toHaveLength(90);
    expect(data.totals.sent).toBe(40);
    expect(data.timezone).toBe("UTC");
  });

  it("filters by stream, domain and connection, and ranks top domains", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId);
    const second = await m.models.DomainModel.create({
      orgId: seed.orgId,
      connectionId: seed.connectionId,
      resendId: `dom_${new Types.ObjectId()}`,
      name: "other.example.com",
      status: "verified",
    });
    await bump(seed, daysAgo(1), { sent: 30, delivered: 30 });
    await bump(
      seed,
      daysAgo(1),
      { sent: 10, delivered: 8, bounced_hard: 2 },
      { domainId: second._id },
    );
    await bump(seed, daysAgo(1), { sent: 20, delivered: 20 }, { stream: "broadcast" });

    const all = await insights.getInsights(ctx, { days: 7, now: NOW });
    expect(all.totals.sent).toBe(60);
    expect(all.domains.map((d) => d.name)).toEqual([seed.domain.name, "other.example.com"]);
    expect(all.domains[1]!.rates.bounced).toBeCloseTo(20);
    expect(all.domains[1]!.bounceTrend.at(-2)).toBeCloseTo(20);
    expect(all.domains[0]!.bounceTrend.every((v) => v === 0)).toBe(true);

    const broadcast = await insights.getInsights(ctx, {
      days: 7,
      now: NOW,
      filters: { stream: "broadcast" },
    });
    expect(broadcast.totals.sent).toBe(20);
    const byDomain = await insights.getInsights(ctx, {
      days: 7,
      now: NOW,
      filters: { domainId: second._id.toHexString() },
    });
    expect(byDomain.totals.sent).toBe(10);
    const byConnection = await insights.getInsights(ctx, {
      days: 7,
      now: NOW,
      filters: { connectionId: new Types.ObjectId().toHexString() },
    });
    expect(byConnection.hasData).toBe(false);
  });

  it("only counts a scoped member's projects, whatever filter they pass", async () => {
    const seed = await seedOrg(m);
    const projectA = new Types.ObjectId();
    const projectB = new Types.ObjectId();
    await bump(seed, daysAgo(1), { sent: 5 }, { projectId: projectA });
    await bump(seed, daysAgo(1), { sent: 9 }, { projectId: projectB, domainId: null });
    await bump(seed, daysAgo(1), { sent: 100 }, { projectId: null, domainId: null });

    const owner = ctxFor(m, seed.orgId);
    expect((await insights.getInsights(owner, { days: 7, now: NOW })).totals.sent).toBe(114);

    const scoped = ctxFor(m, seed.orgId, "developer", { projectScope: [projectA.toHexString()] });
    expect((await insights.getInsights(scoped, { days: 7, now: NOW })).totals.sent).toBe(5);
    const other = await insights.getInsights(scoped, {
      days: 7,
      now: NOW,
      filters: { projectId: projectB.toHexString() },
    });
    expect(other.totals.sent).toBe(0);
    expect(other.hasData).toBe(false);
  });

  it("never reads another org's rollups", async () => {
    const a = await seedOrg(m);
    const b = await seedOrg(m);
    await bump(a, daysAgo(1), { sent: 11 });
    await bump(b, daysAgo(1), { sent: 22 });
    expect(
      (await insights.getInsights(ctxFor(m, a.orgId), { days: 7, now: NOW })).totals.sent,
    ).toBe(11);
  });
});

describe("filter options", () => {
  it("lists connections, domains and projects the member may see", async () => {
    const seed = await seedOrg(m);
    const project = await m.models.ProjectModel.create({
      orgId: seed.orgId,
      name: "Alpha",
      slug: "alpha",
      color: "accent",
    } as never);
    const options = await insights.getInsightFilterOptions(ctxFor(m, seed.orgId));
    expect(options.hasConnection).toBe(true);
    expect(options.domains.map((d) => d.name)).toContain(seed.domain.name);
    expect(options.projects.map((p) => p.name)).toContain("Alpha");
    const scoped = await insights.getInsightFilterOptions(
      ctxFor(m, seed.orgId, "developer", { projectScope: [new Types.ObjectId().toHexString()] }),
    );
    expect(scoped.projects).toEqual([]);
    expect(scoped.domains).toEqual([]);
    void project;
  });
});

describe("overview", () => {
  it("builds KPIs and a summary from real rollups", async () => {
    const seed = await seedOrg(m);
    const ctx = ctxFor(m, seed.orgId);
    await bump(seed, new Date(), { sent: 200, delivered: 196, opened_unique: 98, bounced_hard: 4 });

    const { overview, insights: dto, canSeeInsights } = await overviewData.getOverview(ctx);
    expect(canSeeInsights).toBe(true);
    expect(dto?.totals.sent).toBe(200);
    expect(overview.hasConnection).toBe(true);
    expect(overview.hasData).toBe(true);
    const byKey = Object.fromEntries(overview.kpis.map((k) => [k.key, k]));
    expect(byKey.sent!.value).toBe(200);
    expect(byKey.sent!.series).toHaveLength(7);
    expect(byKey.delivered!.value).toBe(98);
    expect(byKey.opened!.label).toContain("est.");
    expect(byKey.bounced!.value).toBe(2);
    expect(overview.summary).toMatch(/200 emails sent/);
    expect(overview.summary).toMatch(/98% delivered/);
  });

  it("stays empty for orgs without a connection or role access", async () => {
    const orgId = new Types.ObjectId();
    await m.models.OrgSettingsModel.create({ orgId, plan: "pro" });
    const none = await overviewData.getOverview(ctxFor(m, orgId));
    expect(none.overview.hasConnection).toBe(false);
    expect(none.overview.summary).toMatch(/connect your first Resend account/);

    const seed = await seedOrg(m);
    const support = await overviewData.getOverview(ctxFor(m, seed.orgId, "support"));
    expect(support.canSeeInsights).toBe(false);
    expect(support.insights).toBeNull();
    expect(overviewModel.buildOverview(null, true, false).kpis[0]!.value).toBe(0);
  });

  it("flags complaints and high bounce rates in the summary", async () => {
    const math = await import("@/lib/services/insights-math");
    const dto = (sent: number, bounced: number, complained: number) => {
      const totals = {
        ...math.emptyCounts(),
        sent,
        delivered: sent - bounced,
        bounced,
        complained,
      };
      return {
        days: 7 as const,
        timezone: "UTC",
        filters: {},
        hasData: true,
        totals,
        rates: math.computeRates(totals),
        previous: { counts: math.emptyCounts(), rates: math.computeRates(math.emptyCounts()) },
        deltas: math.computeDeltas(totals, math.emptyCounts()),
        series: [],
        domains: [],
        generatedAt: "",
      };
    };
    expect(overviewModel.overviewSummary(dto(100, 1, 0), true)).toMatch(
      /Nothing needs your attention/,
    );
    expect(overviewModel.overviewSummary(dto(100, 8, 0), true)).toMatch(/above the 4% guideline/);
    expect(overviewModel.overviewSummary(dto(100, 1, 2), true)).toMatch(/2 complaints to look at/);
    expect(overviewModel.overviewSummary(null, true)).toMatch(/Connected and listening/);
  });
});

describe("GET /api/v1/insights", () => {
  const get = (query: string) => route.GET(new Request(`http://localhost/api/v1/insights${query}`));

  it("answers 401, 404, 403 and 400 like the other list endpoints", async () => {
    dal.resolve = () => ({ status: "unauthenticated" });
    expect((await get("?orgSlug=acme")).status).toBe(401);
    dal.resolve = () => ({ status: "not_member" });
    expect((await get("?orgSlug=acme")).status).toBe(404);

    const seed = await seedOrg(m);
    dal.resolve = () => ({ status: "ok", ctx: ctxFor(m, seed.orgId, "support") });
    expect((await get("?orgSlug=acme")).status).toBe(403);

    dal.resolve = () => ({ status: "ok", ctx: ctxFor(m, seed.orgId) });
    expect((await get("?orgSlug=acme&days=13")).status).toBe(400);
    expect((await get("?orgSlug=acme&domainId=nope")).status).toBe(400);
  });

  it("returns insights for a member, defaulting to 7 days", async () => {
    const seed = await seedOrg(m);
    await bump(seed, new Date(), { sent: 4, delivered: 4 });
    dal.resolve = () => ({ status: "ok", ctx: ctxFor(m, seed.orgId) });
    const response = await get("?orgSlug=acme");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = (await response.json()) as { days: number; totals: { sent: number } };
    expect(body.days).toBe(7);
    expect(body.totals.sent).toBe(4);
    const filtered = (await (await get(`?orgSlug=acme&days=30&stream=broadcast`)).json()) as {
      days: number;
      totals: { sent: number };
    };
    expect(filtered.days).toBe(30);
    expect(filtered.totals.sent).toBe(0);
  });
});
