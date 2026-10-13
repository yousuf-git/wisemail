"use client";

import { startTransition } from "react";

type RefreshableRouter = { refresh: () => void };

/**
 * Coalesce `router.refresh()` calls from live topics / sync polls. Many cards can subscribe to
 * the same events; without this, each event re-runs the full RSC tree (org layout included).
 */
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: RefreshableRouter | null = null;

const DEFAULT_MS = 300;

export function scheduleRouterRefresh(router: RefreshableRouter, delayMs = DEFAULT_MS): void {
  pending = router;
  if (delayMs <= 0) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    flush();
    return;
  }
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, delayMs);
}

function flush() {
  const next = pending;
  pending = null;
  if (next) startTransition(() => next.refresh());
}
