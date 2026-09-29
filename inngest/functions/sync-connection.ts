import { connectionSyncRequested, inngest } from "@/inngest/client";
import {
  failRunningSync,
  startOrResumeRun,
  syncNextPage,
  type PageOutcome,
  type SyncTrigger,
} from "@/lib/services/sync";

/** Inngest allows 1,000 steps per run; hand over to a fresh run well before that. */
export const MAX_PAGES_PER_INVOCATION = 400;

/** The slice of Inngest's `step` the loop uses, so tests can drive it without a server. */
export type SyncStepTools = {
  run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
  sleep: (id: string, time: string) => Promise<void>;
  sendEvent: (
    id: string,
    payload: { name: string; data: { connectionId: string; orgId: string; trigger: SyncTrigger } },
  ) => Promise<unknown>;
};

export async function runSyncLoop(
  step: SyncStepTools,
  data: { connectionId: string; orgId: string; trigger: SyncTrigger },
  maxPages = MAX_PAGES_PER_INVOCATION,
) {
  const { connectionId, orgId, trigger } = data;
  const run = (await step.run("start", () => startOrResumeRun({ connectionId, trigger }))) as {
    runId: string;
  } | null;
  if (!run) return { status: "skipped" as const };

  for (let page = 0; page < maxPages; page++) {
    const outcome = (await step.run(`page-${page}`, () => syncNextPage(run.runId))) as PageOutcome;
    if (outcome.status === "done" || outcome.status === "failed") return outcome;
    if (outcome.status === "rate_limited") {
      await step.sleep(`backoff-${page}`, `${Math.max(1, outcome.retryAfterSeconds)}s`);
    }
  }

  // Too many pages for one function run: continue in a new one (the run resumes at its cursor).
  await step.sendEvent("continue", {
    name: connectionSyncRequested.name,
    data: { connectionId, orgId, trigger },
  });
  return { status: "continued" as const };
}

/**
 * Backfill and refresh one connection (TRD §2.2 step 4). Calls Resend, so it is throttled per
 * connection to leave headroom under Resend's 10 requests/s per team (TRD §2.3), and runs one at
 * a time per connection so two syncs never race on the same checkpoints.
 *
 * Every page is its own `step.run`: a finished page is never repeated after a retry or a
 * redeploy, and the cursor is checkpointed in `sync_runs` so even a brand-new invocation resumes
 * where the last one stopped. A 429 puts the function to sleep for Resend's `retry-after`
 * instead of burning retries.
 */
export const syncConnection = inngest.createFunction(
  {
    id: "sync-connection",
    triggers: [connectionSyncRequested],
    throttle: { key: "event.data.connectionId", limit: 8, period: "1s" },
    concurrency: { key: "event.data.connectionId", limit: 1 },
    retries: 3,
    onFailure: async ({ event, step }) => {
      const original = event.data.event.data as { connectionId: string };
      await step.run("mark-failed", () =>
        failRunningSync(
          original.connectionId,
          "Something went wrong while syncing. Try again in a moment.",
        ),
      );
    },
  },
  ({ event, step }) => runSyncLoop(step, event.data),
);
