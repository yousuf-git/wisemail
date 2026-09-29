import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const enableTrackingAction = vi.fn();
const reregisterWebhookAction = vi.fn();
const syncNowAction = vi.fn();
vi.mock("@/app/(app)/[orgSlug]/settings/connections/actions", () => ({
  enableTrackingAction: (...a: unknown[]) => enableTrackingAction(...a),
  reregisterWebhookAction: (...a: unknown[]) => reregisterWebhookAction(...a),
  syncNowAction: (...a: unknown[]) => syncNowAction(...a),
}));

import { describeChecklistItem, type ChecklistItemDTO } from "@/lib/dto/checklist";
import type { SyncStatusDTO } from "@/lib/dto/sync";
import { Checklist } from "../checklist";
import { SyncStatus } from "../sync-status";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const item = (
  key: ChecklistItemDTO["key"],
  status: ChecklistItemDTO["status"],
): ChecklistItemDTO => ({
  key,
  status,
  checkedAt: "2026-09-29T10:00:00.000Z",
  ...describeChecklistItem(key, status),
});

const items = [
  item("webhook", "fail"),
  item("open_tracking", "warn"),
  item("click_tracking", "ok"),
  item("receiving", "warn"),
];

describe("Checklist", () => {
  it("shows ok, warn and fail chips with labels, and a fix only where the API allows one", () => {
    render(
      <Checklist
        orgSlug="acme"
        connectionId="c1"
        items={items}
        can={{ connection: true, domain: true }}
      />,
    );
    expect(screen.getByTestId("checklist-webhook")).toHaveAttribute("data-status", "fail");
    expect(screen.getByTestId("checklist-click_tracking")).toHaveAttribute("data-status", "ok");
    expect(screen.getByText("Not set up")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getAllByText("Needs a look")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Register webhook" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn on read receipts" })).toBeInTheDocument();
    // Receiving (MX) has no API fix, and ok items have none either.
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("hides fixes without permission and says who to ask", () => {
    render(
      <Checklist
        orgSlug="acme"
        connectionId="c1"
        items={items}
        can={{ connection: false, domain: false }}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getAllByText("Ask an Admin to fix this")).toHaveLength(2);
  });

  it("a developer may toggle tracking but not re-register the webhook", () => {
    render(
      <Checklist
        orgSlug="acme"
        connectionId="c1"
        items={items}
        can={{ connection: false, domain: true }}
      />,
    );
    expect(screen.getByRole("button", { name: "Turn on read receipts" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register webhook" })).toBeNull();
  });

  it("disables no fixes for read-only connections: they are not offered at all", () => {
    render(
      <Checklist
        orgSlug="acme"
        connectionId="c1"
        items={items}
        can={{ connection: true, domain: true }}
        fixesDisabled
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("runs the fix through the server action and refreshes", async () => {
    enableTrackingAction.mockResolvedValue({
      ok: true,
      data: { updated: ["a.com"], missing: [], checklist: [] },
    });
    render(
      <Checklist
        orgSlug="acme"
        connectionId="c1"
        items={items}
        can={{ connection: true, domain: true }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Turn on read receipts" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(enableTrackingAction).toHaveBeenCalledWith("acme", { connectionId: "c1", kind: "open" });
  });

  it("lists the affected domains on the detail view", () => {
    render(
      <Checklist
        orgSlug="acme"
        connectionId="c1"
        items={[{ ...item("open_tracking", "warn"), domains: ["a.com", "b.com"] }]}
        can={{ connection: true, domain: true }}
        showDomains
      />,
    );
    expect(screen.getByText("a.com, b.com")).toBeInTheDocument();
  });
});

describe("SyncStatus", () => {
  const base: SyncStatusDTO = {
    runId: "r1",
    state: "completed",
    trigger: "manual",
    startedAt: "2026-09-29T10:00:00.000Z",
    finishedAt: "2026-09-29T10:00:05.000Z",
    stage: null,
    error: null,
    progress: [],
  };

  it("offers Sync now when idle and never-synced, and calls the action", async () => {
    syncNowAction.mockResolvedValue({ ok: true, data: { mode: "queued" } });
    render(<SyncStatus orgSlug="acme" connectionId="c1" sync={null} lastSyncAt={null} canSync />);
    expect(screen.getByText("Not synced yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => expect(syncNowAction).toHaveBeenCalledWith("acme", { connectionId: "c1" }));
  });

  it("shows progress while running and disables the button", () => {
    render(
      <SyncStatus
        orgSlug="acme"
        connectionId="c1"
        sync={{
          ...base,
          state: "running",
          finishedAt: null,
          stage: { key: "contacts", label: "Contacts" },
          progress: [
            { key: "domains", label: "Domains", status: "completed", count: 3 },
            { key: "contacts", label: "Contacts", status: "running", count: 25 },
          ],
        }}
        lastSyncAt={null}
        canSync
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Syncing contacts");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2 steps");
    expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
  });

  it("shows a failure with its reason and a Retry sync button", () => {
    render(
      <SyncStatus
        orgSlug="acme"
        connectionId="c1"
        sync={{ ...base, state: "failed", error: "Resend refused to list domains." }}
        lastSyncAt={null}
        canSync
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Resend refused to list domains.");
    expect(screen.getByRole("button", { name: "Retry sync" })).toBeEnabled();
  });

  it("hides the button for people who cannot sync", () => {
    render(
      <SyncStatus
        orgSlug="acme"
        connectionId="c1"
        sync={base}
        lastSyncAt={base.finishedAt}
        canSync={false}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/^Synced /)).toBeInTheDocument();
  });
});
