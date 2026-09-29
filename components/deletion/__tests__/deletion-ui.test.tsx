import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bulk = vi.hoisted(() => ({
  countMatchingAction: vi.fn(),
  countTrashAction: vi.fn(),
  emptyTrashAction: vi.fn(),
  permanentlyDeleteAction: vi.fn(),
  startBulkAction: vi.fn(),
  getBulkOperationAction: vi.fn(),
}));
const inbox = vi.hoisted(() => ({
  trashItemsAction: vi.fn(),
  restoreItemsAction: vi.fn(),
}));
vi.mock("@/app/(app)/[orgSlug]/inbox/bulk-actions", () => bulk);
vi.mock("@/app/(app)/[orgSlug]/inbox/actions", () => inbox);
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { BulkBar, type BarSelection } from "../bulk-bar";
import { PermanentDeleteDialog } from "../permanent-delete-dialog";
import { chunk } from "../use-selection";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const ok = <T,>(data: T) => ({ ok: true as const, data });
const rows = Array.from({ length: 3 }, (_, i) => ({ kind: "thread" as const, id: `t${i}` }));

function selection(overrides: Partial<BarSelection> = {}): BarSelection {
  return {
    selecting: true,
    count: 3,
    allMatching: null,
    setAllMatching: vi.fn(),
    clear: vi.fn(),
    stop: vi.fn(),
    selectLoaded: vi.fn(),
    targets: { threadIds: ["t0", "t1", "t2"], emailIds: [] },
    ...overrides,
  };
}

const bar = (props: Partial<React.ComponentProps<typeof BulkBar>> = {}) => (
  <BulkBar
    orgSlug="acme"
    mode="inbox"
    selection={selection()}
    rows={rows}
    hasMore={false}
    filter={{ source: "inbox" }}
    canTrash
    canDelete
    onDone={vi.fn()}
    track={vi.fn()}
    {...props}
  />
);

describe("PermanentDeleteDialog", () => {
  it("says what really happens and needs the typed number for bulk deletes", async () => {
    const onConfirm = vi.fn().mockResolvedValue(null);
    render(
      <PermanentDeleteDialog
        open
        onOpenChange={vi.fn()}
        count={4812}
        typeCount
        onConfirm={onConfirm}
      />,
    );
    expect(
      screen.getByText(/Resend keeps its copy until its own retention ends/),
    ).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Delete permanently" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "4,811" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "4,812" } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(4812));
  });

  it("shows the server's message and stays open when it fails", async () => {
    const onOpenChange = vi.fn();
    render(
      <PermanentDeleteDialog
        open
        onOpenChange={onOpenChange}
        count={2}
        onConfirm={vi.fn().mockResolvedValue("Nope, not allowed")}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(await screen.findByText("Nope, not allowed")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("BulkBar", () => {
  it("moves the selection to Trash in chunks of 100 with an Undo", async () => {
    inbox.trashItemsAction.mockResolvedValue(ok({ threads: 1, emails: 1 }));
    const ids = Array.from({ length: 230 }, (_, i) => `t${i}`);
    const onDone = vi.fn();
    render(
      bar({
        selection: selection({ count: 230, targets: { threadIds: ids, emailIds: [] } }),
        rows: ids.map((id) => ({ kind: "thread" as const, id })),
        onDone,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Move to Trash/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(inbox.trashItemsAction.mock.calls.map((c) => c[1].threadIds.length)).toEqual([
      100, 100, 30,
    ]);
    const { toast } = await import("sonner");
    const options = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(options.action.label).toBe("Undo");
  });

  it("offers 'Select all N matching' only when every loaded row is selected and more exist", async () => {
    bulk.countMatchingAction.mockResolvedValue(ok(4812));
    const setAllMatching = vi.fn();
    const { rerender } = render(bar({ hasMore: false, selection: selection({ setAllMatching }) }));
    expect(screen.queryByText(/Select all .* matching/)).toBeNull();
    rerender(bar({ hasMore: true, selection: selection({ setAllMatching }) }));
    const link = await screen.findByRole("button", { name: "Select all 4,812 matching" });
    fireEvent.click(link);
    expect(setAllMatching).toHaveBeenCalledWith(4812);
    expect(bulk.countMatchingAction).toHaveBeenCalledWith("acme", { filter: { source: "inbox" } });
  });

  it("all matching: starts a background bulk operation and tracks it", async () => {
    const op = { id: "op1", action: "trash", status: "queued", total: 4812, processed: 0 };
    bulk.startBulkAction.mockResolvedValue(ok(op));
    const track = vi.fn();
    const stop = vi.fn();
    render(bar({ track, selection: selection({ allMatching: 4812, count: 3, stop }) }));
    expect(screen.getByText("All 4,812 matching selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Move to Trash/ }));
    await waitFor(() => expect(track).toHaveBeenCalledWith(op));
    expect(bulk.startBulkAction).toHaveBeenCalledWith("acme", {
      action: "trash",
      filter: { source: "inbox" },
    });
    expect(stop).toHaveBeenCalled();
  });

  it("all matching permanent delete needs the typed count and sends it", async () => {
    const op = { id: "op2", action: "delete", status: "queued", total: 150, processed: 0 };
    bulk.startBulkAction.mockResolvedValue(ok(op));
    const track = vi.fn();
    render(bar({ track, selection: selection({ allMatching: 150 }) }));
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    const confirm = await screen.findAllByRole("button", { name: "Delete permanently" });
    const dialogButton = confirm.at(-1)!;
    expect(dialogButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "150" } });
    fireEvent.click(dialogButton);
    await waitFor(() => expect(track).toHaveBeenCalledWith(op));
    expect(bulk.startBulkAction).toHaveBeenCalledWith("acme", {
      action: "delete",
      filter: { source: "inbox" },
      confirmCount: 150,
    });
  });

  it("hides permanent delete and Empty trash without the permission", () => {
    render(bar({ mode: "trash", canDelete: false, filter: { source: "trash" } }));
    expect(screen.queryByRole("button", { name: "Delete permanently" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Empty trash" })).toBeNull();
    expect(screen.getByRole("button", { name: /Restore/ })).toBeInTheDocument();
  });

  it("Empty trash asks for the typed count above 100 and starts the job", async () => {
    bulk.countTrashAction.mockResolvedValue(ok(230));
    const op = { id: "op3", action: "delete", status: "queued", total: 230, processed: 0 };
    bulk.emptyTrashAction.mockResolvedValue(ok({ mode: "job", operation: op }));
    const track = vi.fn();
    render(bar({ mode: "trash", track, filter: { source: "trash" } }));
    fireEvent.click(screen.getByRole("button", { name: "Empty trash" }));
    const dialog = await screen.findByRole("dialog");
    const dialogButton = within(dialog).getByRole("button", { name: "Empty trash" });
    fireEvent.change(within(dialog).getByLabelText(/Type/), { target: { value: "230" } });
    fireEvent.click(dialogButton);
    await waitFor(() => expect(track).toHaveBeenCalledWith(op));
    expect(bulk.emptyTrashAction).toHaveBeenCalledWith("acme", { confirmCount: 230 });
  });
});

describe("chunk", () => {
  it("splits into parts of at most n", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
