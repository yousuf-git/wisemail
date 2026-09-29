import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const removeConnectionAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/(app)/[orgSlug]/settings/connections/actions", () => ({ removeConnectionAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RemoveConnectionDialog } from "../remove-connection-dialog";
import type { ConnectionDTO } from "@/lib/dto/connection";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  removeConnectionAction.mockResolvedValue({ ok: true, data: { id: "c1", data: "kept" } });
});

const connection = { id: "c1", name: "Acme" } as ConnectionDTO;
const open = () =>
  render(
    <RemoveConnectionDialog orgSlug="acme" connection={connection} open onOpenChange={vi.fn()} />,
  );

describe("RemoveConnectionDialog: keep or delete synced data", () => {
  it("keeps synced data by default and only needs the connection name", async () => {
    open();
    expect(screen.getByRole("radio", { name: /Keep it, read-only/ })).toBeChecked();
    const remove = screen.getByRole("button", { name: "Remove connection" });
    expect(remove).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "Acme" } });
    fireEvent.click(remove);
    await waitFor(() => expect(removeConnectionAction).toHaveBeenCalled());
    expect(removeConnectionAction).toHaveBeenCalledWith("acme", {
      connectionId: "c1",
      confirmName: "Acme",
    });
  });

  it("deleting the data needs the typed word DELETE on top of the name", async () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: /Delete the synced data too/ }));
    expect(screen.getByText(/Other accounts are not touched/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "Acme" } });
    const remove = screen.getByRole("button", { name: "Remove and delete data" });
    expect(remove).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/to erase the synced data/), {
      target: { value: "delete" },
    });
    expect(remove).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/to erase the synced data/), {
      target: { value: "DELETE" },
    });
    expect(remove).toBeEnabled();
    fireEvent.click(remove);
    await waitFor(() => expect(removeConnectionAction).toHaveBeenCalled());
    expect(removeConnectionAction).toHaveBeenCalledWith("acme", {
      connectionId: "c1",
      confirmName: "Acme",
      deleteSyncedData: true,
      confirmDelete: "DELETE",
    });
  });
});
