import { describe, expect, it } from "vitest";

import {
  assertFeatureFor,
  assertLimitFor,
  computeEntitlements,
  limitMessage,
} from "@/lib/billing/entitlements";
import {
  FEATURES,
  PLAN_CATALOG,
  PLAN_ORDER,
  getNextTier,
  minPlanFor,
  overageCostUsd,
} from "@/lib/billing/plans";

const now = new Date("2026-09-15T12:00:00Z");
const period = { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-10-01T00:00:00Z") };
const settings = (over: Record<string, unknown> = {}) => ({
  plan: "free" as const,
  planState: "free" as const,
  trial: null,
  billingPeriod: period,
  ...over,
});

describe("plan catalog (PRICING §3)", () => {
  it("has the documented limits per tier", () => {
    const l = (p: (typeof PLAN_ORDER)[number]) => PLAN_CATALOG[p].limits;
    expect(l("free")).toMatchObject({
      connections: 1,
      members: 2,
      projects: 1,
      alertRules: 3,
      emailsTrackedPerMonth: 5_000,
      retentionDays: 30,
      aiCreditsPerMonth: 0,
    });
    expect(l("pro")).toMatchObject({
      connections: 3,
      retentionDays: 180,
      aiCreditsPerMonth: 1_000,
    });
    expect(l("team")).toMatchObject({
      connections: 10,
      retentionDays: 365,
      aiCreditsPerMonth: 5_000,
    });
    expect(l("agency")).toMatchObject({
      connections: 15,
      members: null,
      retentionDays: 730,
      aiCreditsPerMonth: 15_000,
    });
  });

  it("unlocks features tier by tier", () => {
    expect(minPlanFor("ai")).toBe("pro");
    expect(minPlanFor("digests")).toBe("pro");
    expect(minPlanFor("projectScopedMembers")).toBe("team");
    expect(minPlanFor("auditLog")).toBe("team");
    for (const feature of FEATURES) {
      const min = PLAN_ORDER.indexOf(minPlanFor(feature));
      PLAN_ORDER.forEach((p, i) => expect(PLAN_CATALOG[p].features[feature]).toBe(i >= min));
    }
    expect(getNextTier("agency")).toBeNull();
  });

  it("rounds overage up to the next 10k at the tier's rate", () => {
    expect(overageCostUsd("pro", 1)).toBe(1);
    expect(overageCostUsd("pro", 10_001)).toBe(2);
    expect(overageCostUsd("team", 25_000)).toBe(2.25);
    expect(overageCostUsd("agency", 100_000)).toBe(5);
    expect(overageCostUsd("free", 50_000)).toBe(0);
    expect(overageCostUsd("pro", 0)).toBe(0);
  });
});

describe("computeEntitlements", () => {
  it("is Free without settings", () => {
    const e = computeEntitlements(null, now);
    expect(e).toMatchObject({ plan: "free", planLabel: "Free", nextTierLabel: "Pro" });
    expect(e.limits.emailsTrackedPerMonth).toBe(5_000);
    expect(e.features.ai).toBe(false);
  });

  it("merges per-org overrides over the catalog and ignores null overrides", () => {
    const e = computeEntitlements(
      settings({
        plan: "pro",
        planState: "active",
        limitOverrides: {
          connections: 8,
          retentionDays: 400,
          members: null,
          aiCreditsPerMonth: 50,
        },
      }),
      now,
    );
    expect(e.limits).toMatchObject({
      connections: 8,
      retentionDays: 400,
      members: 5,
      aiCreditsPerMonth: 50,
      projects: 5,
    });
    expect(e.features.ai).toBe(true);
  });

  it("gives a running trial Pro, capped AI credits and days left", () => {
    const e = computeEntitlements(
      settings({
        plan: "pro",
        planState: "trialing",
        trial: {
          startedAt: new Date("2026-09-10T12:00:00Z"),
          endsAt: new Date("2026-09-24T12:00:00Z"),
        },
      }),
      now,
    );
    expect(e.plan).toBe("pro");
    expect(e.trial).toMatchObject({ active: true, daysLeft: 9 });
    expect(e.limits.aiCreditsPerMonth).toBe(200);
    expect(e.limits.connections).toBe(3);
  });

  it("lets an explicit AI override beat the trial cap", () => {
    const e = computeEntitlements(
      settings({
        plan: "pro",
        planState: "trialing",
        limitOverrides: { aiCreditsPerMonth: 900 },
        trial: {
          startedAt: new Date("2026-09-10T12:00:00Z"),
          endsAt: new Date("2026-09-24T12:00:00Z"),
        },
      }),
      now,
    );
    expect(e.limits.aiCreditsPerMonth).toBe(900);
  });

  it("treats an expired trial as Free even before the job ran", () => {
    const e = computeEntitlements(
      settings({
        plan: "pro",
        planState: "trialing",
        trial: {
          startedAt: new Date("2026-08-20T00:00:00Z"),
          endsAt: new Date("2026-09-03T00:00:00Z"),
        },
      }),
      now,
    );
    expect(e).toMatchObject({ plan: "free", storedPlan: "pro", planState: "free" });
    expect(e.trial).toMatchObject({ active: false, daysLeft: 0 });
    expect(e.features.digests).toBe(false);
    expect(e.limits.connections).toBe(1);
  });

  it("exposes a pending change", () => {
    const effectiveAt = new Date("2026-10-01T00:00:00Z");
    const e = computeEntitlements(
      settings({
        plan: "team",
        planState: "active",
        pendingChange: { toPlan: "pro", effectiveAt },
      }),
      now,
    );
    expect(e.pendingChange).toEqual({ toPlan: "pro", effectiveAt, retentionEffectiveAt: null });
  });
});

describe("assertLimitFor / assertFeatureFor", () => {
  const free = computeEntitlements(null, now);

  it("blocks at the limit with the upgrade wording services used before", () => {
    expect(() => assertLimitFor(free, "connections", 0)).not.toThrow();
    expect(() => assertLimitFor(free, "connections", 1)).toThrowError(
      expect.objectContaining({
        code: "plan_limit_reached",
        message: expect.stringContaining("1 of 1 Resend account on Free. Upgrade to Pro"),
      }),
    );
    expect(limitMessage("alertRules", free, 3, 3)).toBe(
      "You have 3 of 3 alert rules on Free. Upgrade to Pro for more.",
    );
  });

  it("never blocks unlimited resources", () => {
    const agency = computeEntitlements(settings({ plan: "agency", planState: "active" }), now);
    expect(() => assertLimitFor(agency, "members", 10_000)).not.toThrow();
    expect(() => assertLimitFor(agency, "projects", 10_000)).not.toThrow();
  });

  it("locks features with the plan that includes them", () => {
    expect(() => assertFeatureFor(free, "auditLog")).toThrowError(
      expect.objectContaining({
        code: "plan_feature_locked",
        message: "Audit log is on Team and above. Your workspace is on Free.",
      }),
    );
    expect(() => assertFeatureFor(free, "digests")).toThrowError(/Pro and above/);
    const team = computeEntitlements(settings({ plan: "team", planState: "active" }), now);
    expect(() => assertFeatureFor(team, "auditLog")).not.toThrow();
  });
});
