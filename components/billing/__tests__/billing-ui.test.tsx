import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { UsageTile } from "@/components/app/usage-tile";
import { LockedFeature } from "../locked-feature";
import { PlanBanner } from "../plan-banner";

afterEach(cleanup);

describe("LockedFeature", () => {
  const face = <span>Assign</span>;

  it("keeps the control visible with a lock and names the plan for Owners", async () => {
    render(
      <LockedFeature name="Assignment" planLabel="Pro" orgSlug="acme" isOwner>
        {face}
      </LockedFeature>,
    );
    const trigger = screen.getByRole("button", { name: "Assignment is on Pro and above" });
    expect(trigger).toHaveTextContent("Assign");
    await userEvent.click(trigger);
    expect(await screen.findByText("Assignment is on Pro and above")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute(
      "href",
      "/acme/settings/billing",
    );
  });

  it("tells everyone else to ask the Owner", async () => {
    render(
      <LockedFeature name="Assignment" planLabel="Pro" orgSlug="acme" isOwner={false}>
        {face}
      </LockedFeature>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText(/Ask your Owner to upgrade/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "See plans" })).toBeNull();
  });
});

describe("PlanBanner", () => {
  it("shows the message with one action and can be dismissed for 24 hours", async () => {
    window.localStorage.clear();
    render(
      <PlanBanner
        banner={{
          kind: "trial",
          message: "Pro trial: 3 days left.",
          action: { label: "Choose a plan", href: "/acme/settings/billing" },
        }}
      />,
    );
    expect(await screen.findByText("Pro trial: 3 days left.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose a plan" })).toHaveAttribute(
      "href",
      "/acme/settings/billing",
    );
    await userEvent.click(screen.getByRole("button", { name: /Dismiss/ }));
    expect(screen.queryByText("Pro trial: 3 days left.")).toBeNull();
    expect(Number(window.localStorage.getItem("wisemail:banner:trial"))).toBeGreaterThan(
      Date.now(),
    );
  });

  it("renders nothing without a banner", () => {
    const { container } = render(<PlanBanner banner={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("UsageTile allowance states", () => {
  const base = { plan: "Pro", connectionLimit: 3, allowance: 1_000 };

  it("stays calm under 80%", () => {
    render(
      <UsageTile usage={{ ...base, used: { transactional: 300, broadcast: 0, inbound: 0 } }} />,
    );
    expect(screen.getByTestId("usage-allowance")).toHaveTextContent("of 1,000 this period");
  });

  it("names the overage past 100%", () => {
    render(
      <UsageTile
        usage={{
          ...base,
          used: { transactional: 1_000, broadcast: 200, inbound: 0 },
          overageCostUsd: 1,
        }}
      />,
    );
    expect(screen.getByTestId("usage-allowance")).toHaveTextContent(
      "Over by 200 · est. $1 overage",
    );
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "1200");
  });

  it("shows AI credits when the plan has them", () => {
    render(<UsageTile usage={{ ...base, aiCredits: 850 }} />);
    expect(screen.getByText("850 AI credits")).toBeInTheDocument();
  });
});
