import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/acme/inbox", live: "live" as string | null }));
vi.mock("@/lib/realtime/live-context", () => ({
  LiveProvider: ({ children }: { children: React.ReactNode }) => children,
  useLiveStatus: () => nav.live,
  useLiveTopics: () => undefined,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => null,
}));

import { ThemeProvider } from "@/components/theme/theme-provider";
import { BreadcrumbLabel, BreadcrumbProvider, looksLikeId } from "../breadcrumb-label";
import { Topbar } from "../topbar";

afterEach(cleanup);

const ID = "6abc2aa829c612d82c91a0dc";

function shell(children?: React.ReactNode) {
  return render(
    <ThemeProvider>
      <BreadcrumbProvider>
        <Topbar orgName="Acme" orgSlug="acme" dock={<div />} />
        {children}
      </BreadcrumbProvider>
    </ThemeProvider>,
  );
}

describe("breadcrumbs", () => {
  it("shows a registered human label instead of the raw id", () => {
    nav.pathname = `/acme/inbox/${ID}`;
    shell(<BreadcrumbLabel segment={ID} label="Invoice question" />);
    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumb).toHaveTextContent("Invoice question");
    expect(crumb).not.toHaveTextContent(ID);
    expect(screen.getByText("Invoice question")).toHaveAttribute("aria-current", "page");
  });

  it("never renders a bare id while the label is still unknown", () => {
    nav.pathname = `/acme/activity/${ID}`;
    shell();
    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumb).not.toHaveTextContent(ID);
    expect(crumb).toHaveTextContent("…");
  });

  it("labels are keyed by segment, so a stale one never names another page", () => {
    nav.pathname = `/acme/alerts/incidents/${"0".repeat(24)}`;
    shell(<BreadcrumbLabel segment={ID} label="Other incident" />);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).not.toHaveTextContent(
      "Other incident",
    );
  });

  it("humanises plain segments and keeps the org link", () => {
    nav.pathname = "/acme/api-keys";
    shell();
    expect(screen.getByRole("link", { name: "Acme" })).toHaveAttribute("href", "/acme");
    expect(screen.getByText("API keys")).toBeInTheDocument();
  });

  it("recognises object ids only", () => {
    expect(looksLikeId(ID)).toBe(true);
    expect(looksLikeId("connections")).toBe(false);
    expect(looksLikeId("sent")).toBe(false);
  });
});

describe("topbar", () => {
  it("collapses search to an icon button (text only from 1200px) and never wraps", () => {
    nav.pathname = "/acme/domains";
    shell();
    const search = screen.getByRole("button", { name: "Search (Command K)" });
    expect(search.className).toContain("shrink-0");
    expect(search.className).toContain("whitespace-nowrap");
    // The label and shortcut only exist from 1200px up.
    expect(screen.getByText("Search emails, contacts…").className).toContain("min-[1200px]:inline");
    expect(screen.getByText("Search emails, contacts…").className).toContain("hidden");
    const list = screen.getByRole("list");
    expect(list.className).toContain("overflow-hidden");
    expect(list.className).toContain("whitespace-nowrap");
  });

  it("shows the live indicator in the bar below 1000px", () => {
    nav.pathname = "/acme/domains";
    nav.live = "live";
    shell();
    const dot = screen.getByTestId("live-dot");
    expect(dot).toHaveAttribute("data-status", "live");
    expect(dot.parentElement?.className).toContain("min-[1000px]:hidden");
  });
});
