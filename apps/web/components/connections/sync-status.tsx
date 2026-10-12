"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";

import { syncNowAction } from "@/app/(app)/[orgSlug]/settings/connections/actions";
import { Button } from "@/components/ui/button";
import type { SyncStatusDTO } from "@/lib/dto/sync";
import { useLiveStatus, useLiveTopics } from "@/lib/realtime/live-context";
import { scheduleRouterRefresh } from "@/lib/realtime/schedule-refresh";
import { topics } from "@/lib/realtime/topics";
import { timeAgo } from "./status";

/** Re-read of a running sync while the live stream is down; live events do the rest. */
const POLL_MS = 5000;

export function SyncStatus({
  orgSlug,
  connectionId,
  sync,
  lastSyncAt,
  canSync,
}: {
  orgSlug: string;
  connectionId: string;
  sync: SyncStatusDTO | null;
  lastSyncAt: string | null;
  canSync: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const running = sync?.state === "running";
  const failed = sync?.state === "failed";

  useLiveTopics([topics.connection(connectionId)], () => scheduleRouterRefresh(router));
  const live = useLiveStatus() === "live";
  useEffect(() => {
    if (!running) return;
    // Slow safety net while live (a missed event heals), faster poll when the stream is down.
    // Coalesce with LiveRefresh so N connection cards don't each re-run the org layout.
    const id = setInterval(() => scheduleRouterRefresh(router), live ? 15_000 : POLL_MS);
    return () => clearInterval(id);
  }, [running, live, router]);

  function requestSync() {
    start(async () => {
      const result = await syncNowAction(orgSlug, { connectionId });
      if (!result.ok) toast.error(result.error.message);
      else if (result.data.mode === "already_running") toast.info("A sync is already running");
      scheduleRouterRefresh(router, 0);
    });
  }

  const done = sync?.progress.filter((p) => p.status === "completed").length ?? 0;
  const total = sync?.progress.length ?? 0;
  const busy = running || pending;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
      data-testid="sync-status"
    >
      <div className="min-w-0 text-[0.8125rem] text-ink-secondary" role="status" aria-live="polite">
        {running ? (
          <p className="flex items-center gap-2">
            <RefreshCw aria-hidden className="size-4 shrink-0 animate-spin text-accent-fill" />
            <span>
              Syncing{sync?.stage ? ` ${sync.stage.label.toLowerCase()}` : ""}…{" "}
              <span className="text-ink-muted">
                {done} of {total} steps
              </span>
            </span>
          </p>
        ) : failed ? (
          <p className="flex items-start gap-2 text-danger-ink">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="max-w-[62ch]">
              Last sync didn&apos;t finish. {sync?.error ?? "Try again in a moment."}
            </span>
          </p>
        ) : lastSyncAt ? (
          <p suppressHydrationWarning>Synced {timeAgo(lastSyncAt)}</p>
        ) : (
          <p className="text-ink-muted">Not synced yet</p>
        )}
      </div>
      {canSync ? (
        <Button size="sm" variant="outline" onClick={requestSync} disabled={busy}>
          <RefreshCw aria-hidden className={busy ? "animate-spin" : undefined} />
          {failed ? "Retry sync" : "Sync now"}
        </Button>
      ) : null}
    </div>
  );
}
