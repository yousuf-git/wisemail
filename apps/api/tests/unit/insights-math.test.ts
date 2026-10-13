import { describe, expect, it } from "vitest";

import {
  computeDeltas,
  computeRates,
  countDelta,
  countsFromRollup,
  dayKey,
  emptyCounts,
  lastDayKeys,
  rateDelta,
  zonedMidnight,
} from "@/lib/services/insights-math";

const counts = (over: Partial<ReturnType<typeof emptyCounts>>) => ({ ...emptyCounts(), ...over });

describe("rates", () => {
  it("uses sent for delivered and bounced, delivered for engagement and complaints", () => {
    const rates = computeRates(
      counts({ sent: 200, delivered: 190, opened: 95, clicked: 19, bounced: 8, complained: 1 }),
    );
    expect(rates.delivered).toBeCloseTo(95);
    expect(rates.opened).toBeCloseTo(50);
    expect(rates.clicked).toBeCloseTo(10);
    expect(rates.bounced).toBeCloseTo(4);
    expect(rates.complained).toBeCloseTo((1 / 190) * 100);
  });

  it("is null, not zero, without a denominator", () => {
    const rates = computeRates(emptyCounts());
    expect(Object.values(rates).every((v) => v === null)).toBe(true);
  });

  it("maps rollup counters (unique opens and clicks, hard + soft bounces)", () => {
    const c = countsFromRollup({
      sent: 5,
      opened_unique: 3,
      opened_total: 9,
      clicked_unique: 2,
      bounced_hard: 1,
      bounced_soft: 2,
      delivery_delayed: 4,
    });
    expect(c).toMatchObject({
      sent: 5,
      opened: 3,
      clicked: 2,
      bounced: 3,
      bouncedHard: 1,
      delayed: 4,
    });
  });
});

describe("deltas", () => {
  it("percent change for counts, points for rates, null without a baseline", () => {
    expect(countDelta(150, 100)).toBe(50);
    expect(countDelta(50, 100)).toBe(-50);
    expect(countDelta(10, 0)).toBeNull();
    expect(rateDelta(98.6, 98.2)).toBe(0.4);
    expect(rateDelta(null, 5)).toBeNull();

    const d = computeDeltas(
      counts({ sent: 120, delivered: 108, bounced: 6 }),
      counts({ sent: 100, delivered: 98, bounced: 2 }),
    );
    expect(d.sent).toBe(20);
    expect(d.rates.delivered).toBe(-8);
    expect(d.rates.bounced).toBe(3);
    expect(d.rates.opened).toBe(0);
  });
});

describe("time zones", () => {
  it("cuts days in the org zone", () => {
    const at = new Date("2026-03-10T20:00:00Z");
    expect(dayKey(at, "UTC")).toBe("2026-03-10");
    expect(dayKey(at, "Asia/Tokyo")).toBe("2026-03-11");
    expect(dayKey(at, "America/Los_Angeles")).toBe("2026-03-10");
    expect(dayKey(new Date("2026-03-10T03:00:00Z"), "America/Los_Angeles")).toBe("2026-03-09");
  });

  it("finds local midnight, including across DST", () => {
    expect(zonedMidnight("2026-03-11", "Asia/Tokyo").toISOString()).toBe(
      "2026-03-10T15:00:00.000Z",
    );
    // US DST starts 2026-03-08: midnight is still PST, the next midnight is PDT.
    expect(zonedMidnight("2026-03-08", "America/Los_Angeles").toISOString()).toBe(
      "2026-03-08T08:00:00.000Z",
    );
    expect(zonedMidnight("2026-03-09", "America/Los_Angeles").toISOString()).toBe(
      "2026-03-09T07:00:00.000Z",
    );
  });

  it("lists the last N local dates, oldest first, ending today", () => {
    const now = new Date("2026-03-10T20:00:00Z");
    expect(lastDayKeys(now, "Asia/Tokyo", 3)).toEqual(["2026-03-09", "2026-03-10", "2026-03-11"]);
    expect(lastDayKeys(now, "UTC", 2)).toEqual(["2026-03-09", "2026-03-10"]);
  });
});
