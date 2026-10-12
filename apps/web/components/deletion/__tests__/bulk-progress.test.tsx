import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ getBulkOperationAction: vi.fn(), startBulkAction: vi.fn() }));
vi.mock("@/app/(app)/[orgSlug]/inbox/bulk-actions", () => actions);
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { useBulkProgress } from "../bulk-progress";
import type { BulkOperationDTO } from "@/lib/dto/deletion";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => vi.clearAllMocks());

const op = (over: Partial<BulkOperationDTO> = {}): BulkOperationDTO => ({
  id: "op1",
  action: "trash",
  status: "running",
  total: 1250,
  processed: 500,
  error: null,
  undoable: false,
  createdAt: new Date().toISOString(),
  ...over,
});

const held: { current: ReturnType<typeof useBulkProgress> | null } = { current: null };
const tracker = {
  track: (o: BulkOperationDTO) => held.current!.track(o),
};
function Harness({ onFinished }: { onFinished: () => void }) {
  const progress = useBulkProgress("acme", onFinished);
  useEffect(() => {
    held.current = progress;
  });
  return <>{progress.card}</>;
}

describe("useBulkProgress", () => {
  it("shows a progress bar while the job runs and a toast with Undo when a trash finishes", async () => {
    vi.useFakeTimers();
    const onFinished = vi.fn();
    render(<Harness onFinished={onFinished} />);
    act(() => tracker.track(op()));
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "500");
    expect(screen.getByText(/500 of 1,250/)).toBeInTheDocument();

    actions.getBulkOperationAction.mockResolvedValueOnce({
      ok: true,
      data: op({ processed: 1000 }),
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(1300)));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1000");

    actions.getBulkOperationAction.mockResolvedValueOnce({
      ok: true,
      data: op({ status: "done", processed: 1250, undoable: true }),
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(1300)));
    expect(screen.queryByRole("progressbar")).toBeNull();
    const [message, options] = toast.mock.calls[0]!;
    expect(message).toContain("Moved to Trash");
    expect(message).toContain("1,250");
    expect(options.action.label).toBe("Undo");
    expect(onFinished).toHaveBeenCalled();

    // Undo restores by operation, again as a tracked background operation.
    actions.startBulkAction.mockResolvedValue({
      ok: true,
      data: op({ id: "op2", action: "restore" }),
    });
    await act(async () => options.action.onClick());
    expect(actions.startBulkAction).toHaveBeenCalledWith("acme", {
      action: "restore",
      filter: { source: "operation", opId: "op1" },
    });
    expect(screen.getByRole("progressbar", { name: "Restoring" })).toBeInTheDocument();
  });

  it("an operation that already finished only toasts; a failed one says so", () => {
    render(<Harness onFinished={vi.fn()} />);
    act(() => tracker.track(op({ status: "done", processed: 5, total: 5, action: "delete" })));
    expect(toast.mock.calls[0]![0]).toContain("Deleted permanently");
    expect(toast.mock.calls[0]![1].action).toBeUndefined();
    expect(screen.queryByRole("progressbar")).toBeNull();
    act(() => tracker.track(op({ status: "failed", error: "It broke" })));
    expect(toast.error).toHaveBeenCalledWith("It broke");
  });
});
