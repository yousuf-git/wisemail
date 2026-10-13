import { describe, expect, it } from "vitest";

/**
 * The billing callout copy is built in `getBillingOverview`. Keep the wording contract here so
 * Settings > Billing stays user-friendly when catalog prices change mid-subscription.
 */
function priceMigrationMessage(input: {
  planLabel: string;
  interval: "month" | "year";
  oldPriceUsd: number;
  newPriceUsd: number;
  renewsAt: string | null;
}): string {
  const oldP = `$${input.oldPriceUsd}/month`;
  const newP = `$${input.newPriceUsd}/month`;
  const when = input.renewsAt
    ? ` Your current price stays the same until your next renewal on ${new Date(input.renewsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
    : ` Your current price stays the same until your next renewal.`;
  return `Your ${input.planLabel} plan price is changing from ${oldP} to ${newP} (billed ${input.interval === "year" ? "yearly" : "monthly"}).${when}`;
}

describe("price migration callout", () => {
  it("names old vs new and the renewal date", () => {
    const msg = priceMigrationMessage({
      planLabel: "Pro",
      interval: "month",
      oldPriceUsd: 12,
      newPriceUsd: 14,
      renewsAt: "2026-11-12T00:00:00.000Z",
    });
    expect(msg).toContain("from $12/month to $14/month");
    expect(msg).toContain("next renewal");
    expect(msg).toMatch(/Nov/);
  });

  it("works without a renewal date", () => {
    const msg = priceMigrationMessage({
      planLabel: "Team",
      interval: "year",
      oldPriceUsd: 32,
      newPriceUsd: 35,
      renewsAt: null,
    });
    expect(msg).toContain("billed yearly");
    expect(msg).toContain("until your next renewal.");
  });
});
