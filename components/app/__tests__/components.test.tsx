import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/acme/inbox",
  useRouter: () => ({ push: vi.fn() }),
}));

import { AppShell } from "../app-shell";
import { StatusChip, type StatusState } from "../status-chip";
import { Wizi } from "@/components/mascot/wizi";
import { ThemeProvider } from "@/components/theme/theme-provider";

afterEach(cleanup);

describe("StatusChip", () => {
  const cases: [StatusState, string][] = [
    ["success", "bg-success-soft"],
    ["info", "bg-info-soft"],
    ["engaged", "bg-engaged-soft"],
    ["warning", "bg-warning-soft"],
    ["danger", "bg-danger-soft"],
    ["neutral", "bg-neutral-soft"],
  ];
  it.each(cases)("renders %s classes and label", (state, cls) => {
    render(<StatusChip state={state}>Label</StatusChip>);
    const chip = screen.getByText("Label");
    expect(chip).toHaveClass(cls);
    expect(chip).toHaveAttribute("data-state", state);
  });
});

describe("Wizi", () => {
  it("is aria-hidden when decorative", () => {
    const { container } = render(<Wizi mood="wow" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
  });

  it("exposes an accessible name when given a title", () => {
    render(<Wizi title="Wizi waving" />);
    expect(screen.getByRole("img", { name: "Wizi waving" })).toBeInTheDocument();
  });
});

describe("AppShell", () => {
  it("prefixes nav links with the org slug and marks the active one", () => {
    render(
      <ThemeProvider>
        <AppShell
          org={{ id: "1", name: "Acme", slug: "acme" }}
          orgs={[{ id: "1", name: "Acme", slug: "acme" }]}
          user={{ name: "Sam Kim", email: "sam@acme.io" }}
          role="owner"
        >
          <p>content</p>
        </AppShell>
      </ThemeProvider>,
    );
    const hrefs: [string, string][] = [
      ["Inbox", "/acme/inbox"],
      ["Scheduled", "/acme/scheduled"],
      ["Activity", "/acme/activity"],
      ["Contacts", "/acme/audience/contacts"],
      ["Broadcasts", "/acme/broadcasts"],
      ["Templates", "/acme/templates"],
      ["Insights", "/acme/insights"],
      ["Alerts", "/acme/alerts"],
      ["Domains", "/acme/domains"],
      ["API keys", "/acme/api-keys"],
      ["Settings", "/acme/settings/general"],
      ["Compose", "/acme/compose"],
    ];
    for (const [name, href] of hrefs) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Domains" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
