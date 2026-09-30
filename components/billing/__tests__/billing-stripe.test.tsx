import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BillingOverviewDTO } from "@/lib/dto/billing";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  checkout: vi.fn(),
  portal: vi.fn(),
  pack: vi.fn(),
  refresh: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock("@/app/(app)/[orgSlug]/settings/billing/actions", () => ({
  previewPlanChangeAction: mocks.preview,
  startCheckoutAction: mocks.checkout,
  openPortalAction: mocks.portal,
  buyCreditPackAction: mocks.pack,
  changePlanAction: vi.fn(),
  cancelPendingChangeAction: vi.fn(),
  startTrialAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
  useSearchParams: () => mocks.search,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { BillingView } from "../billing-view";

const plan = (id: BillingOverviewDTO["plans"][number]["id"], m: number, a: number) => ({
  id,
  label: id[0]!.toUpperCase() + id.slice(1),
  tagline: "x",
  priceMonthly: m,
  priceAnnualPerMonth: a,
  highlights: ["h"],
  overage: null,
});

function overview(over: Partial<BillingOverviewDTO> = {}): BillingOverviewDTO {
  return {
    billingEnabled: true,
    currentPlan: "free",
    currentLabel: "Free",
    planState: "free",
    trial: null,
    trialAvailable: false,
    pendingChange: null,
    plans: [plan("free", 0, 0), plan("pro", 12, 10), plan("team", 39, 32), plan("agency", 99, 82)],
    canManage: true,
    stripe: {
      fake: false,
      interval: null,
      hasSubscription: false,
      renewsAt: null,
      cancelAtPeriodEnd: false,
      payment: { pastDue: false, graceEndsAt: null },
      extraConnections: null,
      creditPack: { credits: 1000, priceUsd: 5, available: false, balance: 0, maxPacks: 10 },
      overage: null,
    },
    ...over,
  };
}

const assign = vi.fn();
beforeEach(() => {
  mocks.search = new URLSearchParams();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign },
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const preview = (direction: string, toPlan: string, toLabel: string) => ({
  ok: true,
  data: {
    toPlan,
    toLabel,
    direction,
    effectiveAt: new Date().toISOString(),
    readOnlyConnections: [],
    lostFeatures: [],
    retention: null,
    memberOverLimit: 0,
  },
});

describe("BillingView with billing off (beta)", () => {
  it("keeps the beta UI: notice, direct switching, no Stripe sections", () => {
    render(
      <BillingView orgSlug="acme" overview={overview({ billingEnabled: false, stripe: null })} />,
    );
    expect(screen.getByTestId("beta-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("credit-packs")).toBeNull();
    expect(screen.queryByTestId("interval-year")).toBeNull();
    expect(screen.getByRole("button", { name: "Switch to Pro" })).toBeEnabled();
  });
});

describe("BillingView with billing on", () => {
  it("offers monthly and yearly prices and sends the chosen interval to checkout", async () => {
    mocks.preview.mockResolvedValue(preview("upgrade", "pro", "Pro"));
    mocks.checkout.mockResolvedValue({ ok: true, data: { url: "https://stripe.test/c/1" } });
    render(<BillingView orgSlug="acme" overview={overview()} />);
    expect(screen.queryByTestId("beta-notice")).toBeNull();
    expect(within("plan-pro")).toHaveTextContent("$12");

    await userEvent.click(screen.getByTestId("interval-year"));
    expect(within("plan-pro")).toHaveTextContent("$10");
    expect(within("plan-pro")).toHaveTextContent("$120 billed yearly");

    await userEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    await userEvent.click(await screen.findByRole("button", { name: "Continue to checkout" }));
    await waitFor(() =>
      expect(mocks.checkout).toHaveBeenCalledWith("acme", { plan: "pro", interval: "year" }),
    );
    expect(assign).toHaveBeenCalledWith("https://stripe.test/c/1");
  });

  it("sends downgrades and cancellation to the Stripe portal", async () => {
    mocks.preview.mockResolvedValue(preview("downgrade", "free", "Free"));
    mocks.portal.mockResolvedValue({ ok: true, data: { url: "https://stripe.test/p/1" } });
    const o = overview({ currentPlan: "pro", currentLabel: "Pro", planState: "active" });
    o.stripe!.hasSubscription = true;
    o.stripe!.interval = "month";
    o.stripe!.renewsAt = "2026-10-20T00:00:00Z";
    render(<BillingView orgSlug="acme" overview={o} />);
    expect(screen.getByTestId("subscription-details")).toHaveTextContent(
      "Renews on October 20, 2026",
    );
    expect(screen.getByTestId("view-invoices")).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel in Stripe" }));
    await userEvent.click(await screen.findByRole("button", { name: "Continue in Stripe" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://stripe.test/p/1"));
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("opens the portal for invoices", async () => {
    mocks.portal.mockResolvedValue({ ok: true, data: { url: "https://stripe.test/p/2" } });
    const o = overview({ currentPlan: "team", currentLabel: "Team", planState: "active" });
    o.stripe!.hasSubscription = true;
    o.stripe!.interval = "year";
    render(<BillingView orgSlug="acme" overview={o} />);
    await userEvent.click(screen.getByTestId("view-invoices"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://stripe.test/p/2"));
  });

  it("shows a payment issue with the deadline and an update button", async () => {
    mocks.portal.mockResolvedValue({ ok: true, data: { url: "https://stripe.test/p/3" } });
    const o = overview({ currentPlan: "pro", currentLabel: "Pro", planState: "past_due" });
    o.stripe!.hasSubscription = true;
    o.stripe!.interval = "month";
    o.stripe!.payment = { pastDue: true, graceEndsAt: "2026-10-05T00:00:00Z" };
    render(<BillingView orgSlug="acme" overview={o} />);
    const alert = screen.getByTestId("payment-issue");
    expect(alert).toHaveTextContent("couldn't charge your payment method");
    expect(alert).toHaveTextContent("October 5, 2026");
    await userEvent.click(screen.getByTestId("update-payment"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://stripe.test/p/3"));
  });

  it("locks credit packs on Free and sells one pack on paid plans", async () => {
    const { unmount } = render(<BillingView orgSlug="acme" overview={overview()} />);
    expect(screen.getByTestId("credit-packs-locked")).toBeInTheDocument();
    expect(screen.queryByTestId("buy-credits")).toBeNull();
    unmount();

    mocks.pack.mockResolvedValue({ ok: true, data: { url: "https://stripe.test/k/1" } });
    const o = overview({ currentPlan: "pro", currentLabel: "Pro", planState: "active" });
    o.stripe!.creditPack = {
      credits: 1000,
      priceUsd: 5,
      available: true,
      balance: 250,
      maxPacks: 10,
    };
    render(<BillingView orgSlug="acme" overview={o} />);
    expect(screen.getByTestId("credit-packs")).toHaveTextContent("250 pack credits left");
    await userEvent.click(screen.getByTestId("buy-credits"));
    await waitFor(() => expect(mocks.pack).toHaveBeenCalledWith("acme", { quantity: 1 }));
    expect(assign).toHaveBeenCalledWith("https://stripe.test/k/1");
  });

  it("previews what extra connections cost on Agency", () => {
    const o = overview({ currentPlan: "agency", currentLabel: "Agency", planState: "active" });
    o.stripe!.extraConnections = { quantity: 2, included: 15, unitUsd: 5, monthlyUsd: 10 };
    render(<BillingView orgSlug="acme" overview={o} />);
    const card = screen.getByTestId("extra-connections");
    expect(card).toHaveTextContent("You pay for 2 extra ($10/month)");
    expect(screen.getByTestId("extra-connection-preview")).toHaveTextContent(
      "next connection adds $5/month ($15/month in total)",
    );
  });

  it("gives non-owners no purchase controls", () => {
    const o = overview({ canManage: false, currentPlan: "pro", currentLabel: "Pro" });
    o.stripe!.creditPack.available = true;
    o.stripe!.hasSubscription = true;
    render(<BillingView orgSlug="acme" overview={o} />);
    expect(screen.queryByTestId("buy-credits")).toBeNull();
    expect(screen.queryByTestId("view-invoices")).toBeNull();
    expect(screen.getByRole("button", { name: "Choose Team" })).toBeDisabled();
  });

  it("says it is confirming the payment while the webhook is on its way", () => {
    mocks.search = new URLSearchParams("checkout=success");
    render(<BillingView orgSlug="acme" overview={overview()} />);
    expect(screen.getByTestId("checkout-confirming")).toBeInTheDocument();
  });
});

function within(testId: string) {
  return screen.getByTestId(testId);
}
