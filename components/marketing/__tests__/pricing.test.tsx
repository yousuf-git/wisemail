import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { MotionProvider } from "@/components/app/motion-provider";
import { PLAN_CATALOG, PLAN_ORDER } from "@/lib/billing/plans";
import { PricingPlans } from "../pricing-plans";
import { PricingTable } from "../pricing-table";
import {
  annualSavingPerYear,
  costExamples,
  maxAnnualSavingPct,
  planHighlights,
} from "../pricing-data";

beforeAll(() => {
  // Radix RadioGroup measures with ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const renderPlans = () =>
  render(
    <MotionProvider>
      <PricingPlans />
    </MotionProvider>,
  );

describe("PricingPlans", () => {
  it("shows the monthly prices from the plan catalog by default", () => {
    renderPlans();
    for (const id of PLAN_ORDER) {
      expect(screen.getByTestId(`price-${id}`).textContent).toBe(
        `$${PLAN_CATALOG[id].priceMonthly}`,
      );
    }
  });

  it("switches to the annual per-month price and states the yearly saving", () => {
    renderPlans();
    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));
    for (const id of PLAN_ORDER) {
      expect(screen.getByTestId(`price-${id}`).textContent).toBe(
        `$${PLAN_CATALOG[id].priceAnnualPerMonth}`,
      );
    }
    const pro = screen.getByRole("region", { name: "Pro" });
    expect(
      within(pro).getByText(new RegExp(`saves \\$${annualSavingPerYear("pro")} a year`)),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Monthly" }));
    expect(screen.getByTestId("price-team").textContent).toBe(`$${PLAN_CATALOG.team.priceMonthly}`);
  });

  it("links every plan to sign-up and advertises the biggest annual discount", () => {
    renderPlans();
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toHaveLength(PLAN_ORDER.length);
    expect(new Set(links)).toEqual(new Set(["/sign-up"]));
    expect(screen.getByText(`Annual saves up to ${maxAnnualSavingPct()}%`)).toBeTruthy();
  });
});

describe("pricing data", () => {
  it("derives plan bullets from limits", () => {
    expect(planHighlights("free")).toContain("5k tracked emails a month");
    expect(planHighlights("pro")).toContain("75k tracked emails a month");
    expect(planHighlights("agency")).toContain("15 Resend accounts, then $5/mo each");
    expect(planHighlights("agency")).toContain("Unlimited members");
    expect(planHighlights("team")).toContain("1 year of history");
    expect(planHighlights("free")).toContain("AI on paid plans");
  });

  it("computes the cost examples from the catalog (PRICING §3)", () => {
    expect(costExamples.map((e) => [e.wisemailUsd, e.sharePct])).toEqual([
      [12, 60],
      [12, 20],
      [54, 9],
    ]);
  });
});

describe("PricingTable", () => {
  it("has one column per plan and numbers from the catalog", () => {
    render(<PricingTable />);
    const table = screen.getByRole("table");
    for (const id of PLAN_ORDER) {
      expect(
        within(table).getByRole("columnheader", { name: PLAN_CATALOG[id].label }),
      ).toBeTruthy();
    }
    const row = within(table).getByRole("row", { name: /Tracked emails a month/ });
    expect(row.textContent).toContain("2M");
    expect(row.textContent).toContain("500k");
  });
});
