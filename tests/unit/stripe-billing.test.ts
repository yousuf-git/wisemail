import { describe, expect, it } from "vitest";

import { computeEntitlements } from "@/lib/billing/entitlements";
import { PAYMENT_GRACE_DAYS, paymentGraceEnds } from "@/lib/billing/plans";
import {
  REQUIRED_PRICE_KEYS,
  describeKey,
  extraConnectionPriceKey,
  overagePriceKey,
  planPriceKey,
} from "@/lib/billing/stripe-price-keys";
import { describePrice, priceId } from "@/lib/billing/stripe-prices";
import { addMonthsUtc, snapshotFromStripe } from "@/lib/services/billing";
import { extraConnectionsFor, previewExtraConnection } from "@/lib/services/billing-extras";
import { creditsOfSession } from "@/lib/services/billing-webhook";
import { overageUnits } from "@/lib/services/billing-usage";
import { Types } from "mongoose";

describe("price keys", () => {
  it("covers every plan interval, both extra-connection prices, each tier's meter and the pack", () => {
    expect(REQUIRED_PRICE_KEYS).toHaveLength(6 + 2 + 3 + 1);
    expect(planPriceKey("team", "year")).toBe("TEAM_ANNUAL");
    expect(extraConnectionPriceKey("month")).toBe("EXTRA_CONNECTION_MONTHLY");
    expect(overagePriceKey("agency")).toBe("OVERAGE_AGENCY");
  });

  it("maps keys and (fake) ids both ways", () => {
    expect(describeKey("PRO_ANNUAL")).toMatchObject({
      kind: "plan",
      plan: "pro",
      interval: "year",
    });
    expect(describeKey("OVERAGE_TEAM")).toMatchObject({ kind: "overage", plan: "team" });
    expect(describeKey("EXTRA_CONNECTION_ANNUAL")).toMatchObject({
      kind: "extra_connection",
      interval: "year",
    });
    expect(describeKey("CREDIT_PACK").kind).toBe("credit_pack");
    expect(priceId("AGENCY_MONTHLY")).toBe("price_fake_agency_monthly");
    expect(describePrice("price_fake_agency_monthly")).toMatchObject({
      kind: "plan",
      plan: "agency",
    });
    expect(describePrice("price_unknown")).toBeNull();
  });
});

describe("overage units", () => {
  it("rounds up to the next 10k", () => {
    expect(overageUnits(0)).toBe(0);
    expect(overageUnits(1)).toBe(1);
    expect(overageUnits(10_000)).toBe(1);
    expect(overageUnits(10_001)).toBe(2);
    expect(overageUnits(25_000)).toBe(3);
  });
});

describe("extra connections", () => {
  it("bills max(0, connections - 15)", () => {
    expect(extraConnectionsFor(0)).toBe(0);
    expect(extraConnectionsFor(15)).toBe(0);
    expect(extraConnectionsFor(16)).toBe(1);
    expect(extraConnectionsFor(22)).toBe(7);
  });

  it("previews the cost only on Agency with billing on, at the limit", () => {
    const base = {
      plan: "agency",
      billingEnabled: true,
      liveConnections: 15,
      currentExtra: 0,
      limit: 15,
    };
    expect(previewExtraConnection(base)).toMatchObject({
      needsExtra: true,
      newExtra: 1,
      monthlyUsd: 5,
    });
    expect(previewExtraConnection({ ...base, liveConnections: 14 }).needsExtra).toBe(false);
    expect(previewExtraConnection({ ...base, billingEnabled: false }).needsExtra).toBe(false);
    expect(previewExtraConnection({ ...base, plan: "team", limit: 10 }).needsExtra).toBe(false);
    expect(
      previewExtraConnection({ ...base, liveConnections: 17, currentExtra: 2, limit: 17 }),
    ).toMatchObject({ needsExtra: true, newExtra: 3, monthlyUsd: 15 });
  });

  it("raises the Agency connection limit by the paid quantity, but not the others", () => {
    const period = { start: new Date("2026-09-01"), end: new Date("2026-10-01") };
    const agency = computeEntitlements({
      plan: "agency",
      planState: "active",
      billingPeriod: period,
      extraConnections: 3,
    });
    expect(agency.limits.connections).toBe(18);
    const team = computeEntitlements({
      plan: "team",
      planState: "active",
      billingPeriod: period,
      extraConnections: 3,
    });
    expect(team.limits.connections).toBe(10);
    // An explicit override still wins.
    const overridden = computeEntitlements({
      plan: "agency",
      planState: "active",
      billingPeriod: period,
      extraConnections: 3,
      limitOverrides: { connections: 40 },
    });
    expect(overridden.limits.connections).toBe(40);
  });
});

describe("credit pack sessions", () => {
  const session = (over: Record<string, unknown> = {}) =>
    ({
      mode: "payment",
      metadata: { kind: "credit_pack", credits: "2000", orgId: "x" },
      ...over,
    }) as never;

  it("accepts whole packs only", () => {
    expect(creditsOfSession(session())).toBe(2000);
    expect(
      creditsOfSession(session({ metadata: { kind: "credit_pack", credits: "1500" } })),
    ).toBeNull();
    expect(
      creditsOfSession(session({ metadata: { kind: "credit_pack", credits: "-1000" } })),
    ).toBeNull();
    expect(
      creditsOfSession(session({ metadata: { kind: "credit_pack", credits: "999000" } })),
    ).toBeNull();
    expect(creditsOfSession(session({ metadata: { kind: "other", credits: "1000" } }))).toBeNull();
    expect(creditsOfSession(session({ mode: "subscription" }))).toBeNull();
  });
});

describe("payment grace and periods", () => {
  it("lasts 14 days from the first failed payment", () => {
    expect(PAYMENT_GRACE_DAYS).toBe(14);
    const since = new Date("2026-09-01T00:00:00Z");
    expect(paymentGraceEnds(since)?.toISOString()).toBe("2026-09-15T00:00:00.000Z");
    expect(paymentGraceEnds(null)).toBeNull();
  });

  it("adds months without drifting past the end of short months", () => {
    expect(addMonthsUtc(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe(
      "2026-02-28T10:00:00.000Z",
    );
    expect(addMonthsUtc(new Date("2026-01-15T00:00:00Z"), 13).toISOString()).toBe(
      "2027-02-15T00:00:00.000Z",
    );
  });
});

describe("snapshotFromStripe", () => {
  const sub = (status: string, price = "price_fake_team_annual") =>
    ({
      id: "sub_1",
      customer: "cus_1",
      status,
      cancel_at_period_end: true,
      cancel_at: null,
      items: {
        data: [
          {
            id: "si_o",
            price: { id: "price_fake_overage_team" },
            current_period_start: 1,
            current_period_end: 2,
          },
          {
            id: "si_p",
            price: { id: price },
            current_period_start: 1_800_000_000,
            current_period_end: 1_831_536_000,
          },
        ],
      },
    }) as never;

  it("finds the plan item among the other items", () => {
    const snap = snapshotFromStripe(new Types.ObjectId(), sub("active"), new Date(5));
    expect(snap).toMatchObject({
      plan: "team",
      interval: "year",
      status: "active",
      cancelAtPeriodEnd: true,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    });
    expect(snap.periodStart.getTime()).toBe(1_800_000_000_000);
  });

  it("has no plan for a subscription without a Wisemail plan price", () => {
    expect(
      snapshotFromStripe(new Types.ObjectId(), sub("active", "price_other"), new Date()).plan,
    ).toBeNull();
  });
});
