"use client";

import { useCallback, useMemo, useState } from "react";

/** A row that can be selected: what kind it is and its id (a conversation or a single email). */
export type SelectableRow = { kind: "thread" | "email"; id: string };
export const rowKey = (row: SelectableRow) => `${row.kind}-${row.id}`;

export type Targets = { threadIds: string[]; emailIds: string[] };

/**
 * Multi-select for lists (Inbox, Trash, Activity). `selecting` switches the checkboxes on,
 * `allMatching` means "everything that matches the current filter", not just the loaded rows.
 */
export function useRowSelection<T extends SelectableRow>(rows: T[]) {
  const [selecting, setSelecting] = useState(false);
  const [keys, setKeys] = useState<Set<string>>(() => new Set());
  const [allMatching, setAllMatching] = useState<number | null>(null);

  const toggle = useCallback((row: T) => {
    setAllMatching(null);
    setKeys((current) => {
      const next = new Set(current);
      const key = rowKey(row);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setKeys(new Set());
    setAllMatching(null);
  }, []);

  const stop = useCallback(() => {
    setSelecting(false);
    clear();
  }, [clear]);

  const selectLoaded = useCallback(() => setKeys(new Set(rows.map(rowKey))), [rows]);

  // Rows that left the list (trashed, deleted elsewhere) drop out of the selection.
  const live = useMemo(() => {
    const present = new Set(rows.map(rowKey));
    return [...keys].filter((k) => present.has(k));
  }, [keys, rows]);

  const targets: Targets = useMemo(() => {
    const chosen = new Set(live);
    const out: Targets = { threadIds: [], emailIds: [] };
    for (const row of rows) {
      if (!chosen.has(rowKey(row))) continue;
      (row.kind === "thread" ? out.threadIds : out.emailIds).push(row.id);
    }
    return out;
  }, [live, rows]);

  return {
    selecting,
    setSelecting,
    keys: useMemo(() => new Set(live), [live]),
    count: live.length,
    allMatching,
    setAllMatching,
    toggle,
    clear,
    stop,
    selectLoaded,
    targets,
  };
}

export type RowSelection = ReturnType<typeof useRowSelection>;

/** Splits a list into chunks (the server actions take up to 100 ids at a time). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
