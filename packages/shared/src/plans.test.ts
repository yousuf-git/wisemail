import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLAN_CATALOG,
  getPlanLimits,
  minPlanFor,
  overageCostUsd,
  paymentGraceEnds,
  PAYMENT_GRACE_DAYS,
} from "./plans.js";

describe("shared plans helpers", () => {
  it("minPlanFor picks the cheapest tier with the feature", () => {
    expect(minPlanFor("ai")).toBe("pro");
    expect(minPlanFor("projectScopedMembers")).toBe("team");
    expect(minPlanFor("apiKeys")).toBe("free");
  });

  it("getPlanLimits applies overrides", () => {
    expect(getPlanLimits("pro").connections).toBe(3);
    expect(getPlanLimits("pro", { connections: 10 }).connections).toBe(10);
  });

  it("overageCostUsd rounds up to 10k units", () => {
    expect(overageCostUsd("pro", 0)).toBe(0);
    expect(overageCostUsd("pro", 1)).toBe(1);
    expect(overageCostUsd("pro", 10_001)).toBe(2);
    expect(overageCostUsd("free", 100_000)).toBe(0);
  });

  it("accepts an injected catalog", () => {
    const catalog = {
      ...DEFAULT_PLAN_CATALOG,
      pro: { ...DEFAULT_PLAN_CATALOG.pro, overagePer10kUsd: 2 },
    };
    expect(overageCostUsd("pro", 1, catalog)).toBe(2);
  });

  it("paymentGraceEnds adds PAYMENT_GRACE_DAYS", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = paymentGraceEnds(start)!;
    expect(end.getTime() - start.getTime()).toBe(PAYMENT_GRACE_DAYS * 86_400_000);
    expect(paymentGraceEnds(null)).toBeNull();
  });
});
