"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { getBulkOperationAction, startBulkAction } from "@/app/(app)/[orgSlug]/inbox/bulk-actions";
import type { BulkOperationDTO } from "@/lib/dto/deletion";
import { formatCount } from "./permanent-delete-dialog";

const VERB = {
  trash: { doing: "Moving to Trash", done: "Moved to Trash" },
  delete: { doing: "Deleting permanently", done: "Deleted permanently" },
  restore: { doing: "Restoring", done: "Restored" },
} as const;

const POLL_MS = 1200;

/**
 * Follows background bulk operations (TRD §2.14): a small card with a progress bar while the
 * `bulk-delete` job runs (the page stays usable), a toast when it finishes, and "Undo" for a bulk
 * trash for as long as its items are still in Trash. Small operations finish before the request
 * returns and only toast.
 */
export function useBulkProgress(orgSlug: string, onFinished: () => void) {
  const [active, setActive] = useState<BulkOperationDTO[]>([]);
  const finished = useRef(onFinished);
  const trackRef = useRef<(op: BulkOperationDTO) => void>(() => {});
  useEffect(() => {
    finished.current = onFinished;
  });

  const undo = useCallback(
    async (opId: string) => {
      const result = await startBulkAction(orgSlug, {
        action: "restore",
        filter: { source: "operation", opId },
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      trackRef.current(result.data);
    },
    [orgSlug],
  );

  const announce = useCallback(
    (op: BulkOperationDTO) => {
      if (op.status === "failed") {
        toast.error(op.error ?? "The bulk operation could not be finished.");
      } else {
        toast(`${VERB[op.action].done} · ${formatCount(op.processed)} items`, {
          duration: op.undoable ? 8000 : 4000,
          action: op.undoable ? { label: "Undo", onClick: () => void undo(op.id) } : undefined,
        });
      }
      finished.current();
    },
    [undo],
  );

  const track = useCallback(
    (op: BulkOperationDTO) => {
      if (op.status === "done" || op.status === "failed") {
        announce(op);
        return;
      }
      setActive((current) => [...current.filter((o) => o.id !== op.id), op]);
    },
    [announce],
  );
  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  // Poll what is running.
  const ids = active.map((o) => o.id).join(",");
  useEffect(() => {
    if (!ids) return;
    const timer = setInterval(async () => {
      for (const id of ids.split(",")) {
        const result = await getBulkOperationAction(orgSlug, { opId: id });
        if (!result.ok) {
          setActive((current) => current.filter((o) => o.id !== id));
          continue;
        }
        const op = result.data;
        if (op.status === "done" || op.status === "failed") {
          setActive((current) => current.filter((o) => o.id !== id));
          announce(op);
        } else {
          setActive((current) => current.map((o) => (o.id === id ? op : o)));
          finished.current();
        }
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [ids, orgSlug, announce]);

  const card = active.length ? (
    <div
      className="fixed right-4 bottom-4 z-40 grid w-[min(22rem,calc(100vw-2rem))] gap-3"
      data-testid="bulk-progress"
    >
      {active.map((op) => {
        const pct = op.total ? Math.min(100, Math.round((op.processed / op.total) * 100)) : 0;
        return (
          <div
            key={op.id}
            role="status"
            className="grid gap-2 rounded-xl bg-surface p-3.5 shadow-lg ring-1 ring-line"
          >
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-semibold">
                {VERB[op.action].doing} {formatCount(op.total)} items
              </span>
              <span className="text-ink-muted tabular-nums">{pct}%</span>
            </div>
            <div
              role="progressbar"
              aria-label={VERB[op.action].doing}
              aria-valuemin={0}
              aria-valuemax={op.total}
              aria-valuenow={op.processed}
              className="h-1.5 overflow-hidden rounded-full bg-canvas-sunken"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-soft"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-ink-muted">
              {formatCount(op.processed)} of {formatCount(op.total)} · you can keep working
            </p>
          </div>
        );
      })}
    </div>
  ) : null;

  return { track, card };
}
