import { describe, expect, it } from "vitest";

import {
  formatScheduled,
  fromLocalInputValue,
  isValidTimeZone,
  quickPicks,
  toLocalInputValue,
  zonedToInstant,
} from "../schedule";

describe("schedule helpers", () => {
  it("converts wall-clock time in a timezone to the right instant", () => {
    // Berlin is UTC+2 in summer, UTC+1 in winter; New York UTC-4 / UTC-5.
    expect(
      zonedToInstant(
        { year: 2026, month: 7, day: 1, hour: 9, minute: 0 },
        "Europe/Berlin",
      ).toISOString(),
    ).toBe("2026-07-01T07:00:00.000Z");
    expect(
      zonedToInstant(
        { year: 2026, month: 1, day: 15, hour: 9, minute: 0 },
        "Europe/Berlin",
      ).toISOString(),
    ).toBe("2026-01-15T08:00:00.000Z");
    expect(
      zonedToInstant(
        { year: 2026, month: 7, day: 1, hour: 9, minute: 0 },
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-07-01T13:00:00.000Z");
  });

  it("round-trips datetime-local values", () => {
    const at = fromLocalInputValue("2026-10-05T14:30", "Asia/Tokyo")!;
    expect(at.toISOString()).toBe("2026-10-05T05:30:00.000Z");
    expect(toLocalInputValue(at, "Asia/Tokyo")).toBe("2026-10-05T14:30");
    expect(fromLocalInputValue("nonsense", "UTC")).toBeNull();
  });

  it("offers quick picks on the org's wall clock, all in the future", () => {
    const now = new Date("2026-09-29T20:10:00Z"); // Tue 22:10 in Berlin
    const picks = quickPicks(now, "Europe/Berlin");
    const byId = Object.fromEntries(picks.map((p) => [p.id, p.at.toISOString()]));
    expect(byId["tomorrow-am"]).toBe("2026-09-30T07:00:00.000Z");
    expect(byId["tomorrow-pm"]).toBe("2026-09-30T11:00:00.000Z");
    expect(byId.monday).toBe("2026-10-05T07:00:00.000Z");
    expect(picks.every((p) => p.at.getTime() > now.getTime())).toBe(true);
  });

  it("formats with the zone and validates zone names", () => {
    expect(formatScheduled(new Date("2026-07-01T07:00:00Z"), "Europe/Berlin")).toContain("9:00");
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });
});
