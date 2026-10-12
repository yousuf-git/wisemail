"use client";

import { RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { restoreItemsAction, trashItemsAction } from "@/app/(app)/[orgSlug]/inbox/actions";
import {
  countMatchingAction,
  countTrashAction,
  emptyTrashAction,
  permanentlyDeleteAction,
  startBulkAction,
} from "@/app/(app)/[orgSlug]/inbox/bulk-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { BulkOperationDTO } from "@/lib/dto/deletion";
import type { BulkFilter } from "@/lib/deletion/filters";
import { cn } from "@/lib/utils";
import { formatCount, PermanentDeleteDialog } from "./permanent-delete-dialog";
import { chunk, type SelectableRow, type Targets } from "./use-selection";

/** What the toolbar needs from `useRowSelection` (which is generic over the row type). */
export type BarSelection = {
  selecting: boolean;
  count: number;
  allMatching: number | null;
  setAllMatching: (count: number | null) => void;
  clear: () => void;
  stop: () => void;
  selectLoaded: () => void;
  targets: Targets;
};

const CHUNK = 100;

export type BulkMode = "inbox" | "trash" | "activity";

async function inChunks(
  targets: Targets,
  run: (chunk: {
    threadIds?: string[];
    emailIds?: string[];
  }) => Promise<{ ok: boolean; error?: string }>,
): Promise<string | null> {
  const parts = [
    ...chunk(targets.threadIds, CHUNK).map((threadIds) => ({ threadIds })),
    ...chunk(targets.emailIds, CHUNK).map((emailIds) => ({ emailIds })),
  ];
  for (const part of parts) {
    const result = await run(part);
    if (!result.ok) return result.error ?? "Something went wrong.";
  }
  return null;
}

/**
 * Selection toolbar for Inbox, Trash and Activity (TRD §2.14, UC-36 to UC-38): move to Trash,
 * restore, delete permanently (Owner/Admin), Empty trash. When every loaded row is selected and
 * more match the filter, offers "Select all N matching"; those run as background operations with
 * progress. Explicit selections go through the normal actions in chunks of 100.
 */
export function BulkBar({
  orgSlug,
  mode,
  selection,
  rows,
  hasMore,
  filter,
  canTrash,
  canDelete,
  onDone,
  track,
  noun = "conversations",
}: {
  orgSlug: string;
  mode: BulkMode;
  selection: BarSelection;
  rows: SelectableRow[];
  hasMore: boolean;
  /** Selects "all matching" when set (a snapshot of the current filter). */
  filter: BulkFilter | null;
  canTrash: boolean;
  canDelete: boolean;
  onDone: () => void;
  track: (op: BulkOperationDTO) => void;
  noun?: string;
}) {
  const { count, allMatching } = selection;
  const [matching, setMatching] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const filterKey = JSON.stringify(filter);

  const allLoadedSelected = rows.length > 0 && count === rows.length;
  const offerAll = !!filter && hasMore && allLoadedSelected && allMatching === null;

  // How many items match the filter, fetched once the offer is on the table.
  useEffect(() => {
    if (!offerAll || !filter) return;
    let stale = false;
    void countMatchingAction(orgSlug, { filter }).then((result) => {
      if (!stale) setMatching(result.ok ? result.data : null);
    });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerAll, filterKey, orgSlug]);

  const total = allMatching ?? count;
  const hasSelection = total > 0;
  const bigDelete = allMatching !== null || count > CHUNK;

  async function trashSelected() {
    setBusy(true);
    try {
      if (allMatching !== null && filter) {
        const result = await startBulkAction(orgSlug, { action: "trash", filter });
        if (!result.ok) return void toast.error(result.error.message);
        selection.stop();
        track(result.data);
        return;
      }
      const targets = selection.targets;
      const error = await inChunks(targets, async (part) => {
        const r = await trashItemsAction(orgSlug, part);
        return { ok: r.ok, error: r.ok ? undefined : r.error.message };
      });
      if (error) toast.error(error);
      else {
        toast("Moved to Trash", {
          duration: 5000,
          action: {
            label: "Undo",
            onClick: () =>
              void inChunks(targets, async (part) => {
                const r = await restoreItemsAction(orgSlug, part);
                return { ok: r.ok, error: r.ok ? undefined : r.error.message };
              }).then((e) => {
                if (e) toast.error(e);
                else toast.success("Restored");
                onDone();
              }),
          },
        });
        selection.stop();
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  async function restoreSelected() {
    setBusy(true);
    try {
      if (allMatching !== null) {
        const result = await startBulkAction(orgSlug, {
          action: "restore",
          filter: { source: "trash" },
        });
        if (!result.ok) return void toast.error(result.error.message);
        selection.stop();
        track(result.data);
        return;
      }
      const error = await inChunks(selection.targets, async (part) => {
        const r = await restoreItemsAction(orgSlug, part);
        return { ok: r.ok, error: r.ok ? undefined : r.error.message };
      });
      if (error) toast.error(error);
      else {
        toast.success("Restored");
        selection.stop();
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected(typed: number | undefined): Promise<string | null> {
    if (allMatching !== null && filter) {
      const result = await startBulkAction(orgSlug, {
        action: "delete",
        filter: mode === "trash" ? { source: "trash" } : filter,
        confirmCount: typed,
      });
      if (!result.ok) return result.error.message;
      selection.stop();
      track(result.data);
      return null;
    }
    let deleted = 0;
    let skipped = 0;
    const error = await inChunks(selection.targets, async (part) => {
      const r = await permanentlyDeleteAction(orgSlug, part);
      if (r.ok) {
        deleted += r.data.deleted;
        skipped += r.data.skipped;
      }
      return { ok: r.ok, error: r.ok ? undefined : r.error.message };
    });
    if (error) return error;
    toast.success(
      `Deleted ${formatCount(deleted)} ${deleted === 1 ? "email" : "emails"} permanently` +
        (skipped
          ? ` · ${skipped} scheduled ${skipped === 1 ? "email" : "emails"} could not be canceled in Resend and were kept`
          : ""),
    );
    selection.stop();
    onDone();
    return null;
  }

  return (
    <div
      role="toolbar"
      aria-label="Selection"
      className={cn(
        "mx-3 mb-1 grid gap-1.5 rounded-xl bg-canvas-sunken px-3 py-2",
        !selection.selecting && "hidden",
      )}
      data-testid="bulk-bar"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Checkbox
          aria-label={allLoadedSelected ? "Clear selection" : "Select all loaded"}
          checked={allLoadedSelected ? true : count > 0 ? "indeterminate" : false}
          onCheckedChange={() => (allLoadedSelected ? selection.clear() : selection.selectLoaded())}
        />
        <span className="text-[13px] font-semibold tabular-nums" aria-live="polite">
          {hasSelection
            ? allMatching !== null
              ? `All ${formatCount(allMatching)} matching selected`
              : `${formatCount(count)} selected`
            : "Select items"}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {mode !== "trash" && canTrash ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!hasSelection || busy}
              onClick={trashSelected}
            >
              <Trash2 aria-hidden /> Move to Trash
            </Button>
          ) : null}
          {mode === "trash" && canTrash ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!hasSelection || busy}
              onClick={restoreSelected}
            >
              <RotateCcw aria-hidden /> Restore
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              size="sm"
              variant="outline"
              className="text-danger-ink hover:text-danger-ink"
              disabled={!hasSelection || busy}
              onClick={() => setDeleting(true)}
            >
              Delete permanently
            </Button>
          ) : null}
          {mode === "trash" && canDelete ? (
            <EmptyTrashButton
              orgSlug={orgSlug}
              track={track}
              onDone={onDone}
              onEmptied={selection.stop}
            />
          ) : null}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Done selecting"
            onClick={selection.stop}
          >
            <X aria-hidden />
          </Button>
        </span>
      </div>
      {offerAll && matching !== null && matching > count ? (
        <p className="text-[13px] text-ink-secondary">
          The {formatCount(count)} loaded {noun} are selected.{" "}
          <button
            type="button"
            className="font-semibold text-info-ink underline-offset-2 hover:underline"
            onClick={() => selection.setAllMatching(matching)}
          >
            Select all {formatCount(matching)} matching
          </button>
        </p>
      ) : null}
      {allMatching !== null ? (
        <p className="text-[13px] text-ink-secondary">
          Mail that arrives while this runs is not included.{" "}
          <button
            type="button"
            className="font-semibold text-info-ink underline-offset-2 hover:underline"
            onClick={() => selection.setAllMatching(null)}
          >
            Only the loaded ones
          </button>
        </p>
      ) : null}

      <PermanentDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        count={total}
        noun={
          allMatching !== null || mode === "activity" || mode === "trash"
            ? "emails and conversations"
            : noun
        }
        title={`Delete ${formatCount(total)} ${total === 1 ? "item" : "items"} permanently?`}
        typeCount={bigDelete}
        onConfirm={deleteSelected}
      />
    </div>
  );
}

/**
 * "Empty trash" (Owner/Admin): counts what is in Trash, asks for confirmation (the typed number
 * above 100), then deletes right away or starts the background job.
 */
export function EmptyTrashButton({
  orgSlug,
  track,
  onDone,
  onEmptied,
  variant = "destructive",
}: {
  orgSlug: string;
  track: (op: BulkOperationDTO) => void;
  onDone: () => void;
  onEmptied?: () => void;
  variant?: "destructive" | "outline";
}) {
  const [emptying, setEmptying] = useState<number | null | "loading">(null);

  async function openEmpty() {
    setEmptying("loading");
    const result = await countTrashAction(orgSlug);
    if (!result.ok) {
      setEmptying(null);
      return void toast.error(result.error.message);
    }
    if (result.data === 0) {
      setEmptying(null);
      return void toast("Trash is already empty");
    }
    setEmptying(result.data);
  }

  async function emptyNow(typed: number | undefined): Promise<string | null> {
    const result = await emptyTrashAction(orgSlug, { confirmCount: typed });
    if (!result.ok) return result.error.message;
    if (result.data.mode === "job") {
      track(result.data.operation);
    } else {
      toast.success(`Emptied Trash · ${formatCount(result.data.deleted)} emails deleted`);
      onDone();
    }
    onEmptied?.();
    return null;
  }

  return (
    <>
      <Button size="sm" variant={variant} disabled={emptying === "loading"} onClick={openEmpty}>
        Empty trash
      </Button>
      <PermanentDeleteDialog
        open={typeof emptying === "number"}
        onOpenChange={(open) => !open && setEmptying(null)}
        count={typeof emptying === "number" ? emptying : 0}
        title={`Empty Trash (${typeof emptying === "number" ? formatCount(emptying) : 0} emails)?`}
        confirmLabel="Empty trash"
        typeCount={typeof emptying === "number" && emptying > 100}
        onConfirm={emptyNow}
      />
    </>
  );
}
