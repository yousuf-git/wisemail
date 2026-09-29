import { describe, expect, it } from "vitest";

import { ALERT_KINDS, ALERT_KIND_INFO, describeCondition, windowLabel } from "@/lib/alerts/kinds";
import { alertRuleInputSchema } from "@/lib/validation/alert";

const rule = (over: Record<string, unknown> = {}) => ({
  name: "Bounce rate over 3%",
  kind: "bounce_rate",
  condition: { threshold: 3, windowMinutes: 60, minVolume: 10 },
  ...over,
});

describe("alert rule wording", () => {
  it("describes conditions in plain language", () => {
    expect(describeCondition("bounce_rate", { threshold: 3, windowMinutes: 60 })).toBe(
      "Bounce rate over 3% in the last hour",
    );
    expect(describeCondition("bounce_rate", { threshold: 5, windowMinutes: 180 })).toBe(
      "Bounce rate over 5% in the last 3 hours",
    );
    expect(describeCondition("complaint_any", { threshold: 0, windowMinutes: 60 })).toBe(
      "Any complaint in the last hour",
    );
    expect(describeCondition("connection_silent", { threshold: 0, windowMinutes: 1440 })).toBe(
      "No webhook events for 24 hours",
    );
    expect(windowLabel(2880)).toBe("2 days");
  });

  it("every kind has defaults that pass validation", () => {
    for (const kind of ALERT_KINDS) {
      const d = ALERT_KIND_INFO[kind].defaults;
      const parsed = alertRuleInputSchema.safeParse({
        name: ALERT_KIND_INFO[kind].label,
        kind,
        condition: { operator: "gt", ...d },
      });
      expect(parsed.success, kind).toBe(true);
    }
  });
});

describe("alert rule validation", () => {
  it("bounds thresholds and windows", () => {
    expect(alertRuleInputSchema.safeParse(rule()).success).toBe(true);
    // Rollups are hourly: shorter windows would silently mean an hour.
    expect(
      alertRuleInputSchema.safeParse(
        rule({ condition: { threshold: 3, windowMinutes: 15, minVolume: 0 } }),
      ).success,
    ).toBe(false);
    expect(
      alertRuleInputSchema.safeParse(
        rule({ condition: { threshold: 120, windowMinutes: 60, minVolume: 0 } }),
      ).success,
    ).toBe(false);
    expect(
      alertRuleInputSchema.safeParse(
        rule({ condition: { threshold: 3, windowMinutes: 60 * 24 * 8, minVolume: 0 } }),
      ).success,
    ).toBe(false);
    expect(alertRuleInputSchema.safeParse(rule({ name: "x" })).success).toBe(false);
    expect(alertRuleInputSchema.safeParse(rule({ kind: "nope" })).success).toBe(false);
  });

  it("refuses scopes a kind can't use and bad addresses", () => {
    const id = "6abc2338281a4c2bd36389a9";
    expect(
      alertRuleInputSchema.safeParse(
        rule({
          kind: "connection_status",
          condition: { threshold: 0, windowMinutes: 0, minVolume: 0 },
          scope: { domainIds: [id] },
        }),
      ).success,
    ).toBe(false);
    expect(alertRuleInputSchema.safeParse(rule({ scope: { domainIds: [id] } })).success).toBe(true);
    expect(
      alertRuleInputSchema.safeParse(rule({ channels: { email: ["not-an-email"] } })).success,
    ).toBe(false);
    expect(
      alertRuleInputSchema.safeParse(rule({ channels: { email: Array(6).fill("a@b.co") } }))
        .success,
    ).toBe(false);
  });
});
