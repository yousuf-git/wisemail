import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/(app)/[orgSlug]/settings/senders/actions", () => ({
  createSenderAction: vi.fn(),
  updateSenderAction: vi.fn(),
  setSenderDisabledAction: vi.fn(),
  deleteSenderAction: vi.fn(),
}));

import type { SenderDTO } from "@/lib/dto/mail";
import { SendersView } from "../senders-view";

afterEach(cleanup);

const sender = (over: Partial<SenderDTO>): SenderDTO => ({
  id: "a".repeat(24),
  domainId: "d".repeat(24),
  domainName: "acme.com",
  projectId: null,
  localPart: "support",
  address: "support@acme.com",
  displayName: "Acme Support",
  replyTo: [],
  signatureHtml: "",
  isDefault: true,
  status: "active",
  statusReason: null,
  canReceiveReplies: true,
  receivingNote: null,
  version: 0,
  ...over,
});

const all = { create: true, update: true, delete: true };

describe("SendersView", () => {
  it("groups senders by domain with status chips and reasons", () => {
    render(
      <SendersView
        orgSlug="acme"
        domains={[{ id: "d".repeat(24), name: "acme.com", receiving: true }]}
        can={all}
        senders={[
          sender({}),
          sender({
            id: "b".repeat(24),
            localPart: "billing",
            address: "billing@acme.com",
            isDefault: false,
            status: "domain_unverified",
            statusReason: "domain_failed",
          }),
          sender({
            id: "c".repeat(24),
            domainName: "other.io",
            address: "hi@other.io",
            status: "disabled",
            receivingNote: "Replies won't reach your inbox: receiving is off for other.io.",
          }),
        ]}
      />,
    );
    const groups = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(groups).toEqual(["acme.com", "other.io"]);
    const rows = screen.getAllByTestId("sender-row");
    expect(within(rows[0]!).getByText("Active")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Default")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Domain not verified")).toBeInTheDocument();
    expect(
      within(rows[1]!).getByText("The domain failed verification in Resend."),
    ).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Disabled")).toBeInTheDocument();
    expect(within(rows[2]!).getByText(/Replies won't reach your inbox/)).toBeInTheDocument();
  });

  it("points to Connections when there are no verified domains", () => {
    render(<SendersView orgSlug="acme" senders={[]} domains={[]} can={all} />);
    expect(screen.getByText("Verify a domain to create senders")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: /Open Connections/ });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute("href", "/acme/settings/connections");
  });

  it("hides row actions and the create button without permission", () => {
    render(
      <SendersView
        orgSlug="acme"
        senders={[sender({})]}
        domains={[{ id: "d".repeat(24), name: "acme.com", receiving: true }]}
        can={{ create: false, update: false, delete: false }}
      />,
    );
    expect(screen.queryByRole("button", { name: /New sender/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Only Owners, Admins and Developers/)).toBeInTheDocument();
  });

  it("offers actions with permission", () => {
    render(
      <SendersView
        orgSlug="acme"
        senders={[sender({})]}
        domains={[{ id: "d".repeat(24), name: "acme.com", receiving: true }]}
        can={all}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Actions for support@acme.com" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New sender/ })).toBeEnabled();
  });
});
