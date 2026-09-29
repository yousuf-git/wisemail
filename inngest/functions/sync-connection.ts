import { connectionSyncRequested, inngest } from "@/inngest/client";
import { runSyncStub } from "@/lib/services/sync";

/**
 * Backfill and refresh one connection. Calls Resend, so it is throttled per connection to leave
 * headroom under Resend's 10 requests/s per team (TRD §2.3), and runs one at a time per
 * connection so two syncs never race on the same checkpoints.
 */
export const syncConnection = inngest.createFunction(
  {
    id: "sync-connection",
    triggers: [connectionSyncRequested],
    throttle: { key: "event.data.connectionId", limit: 8, period: "1s" },
    concurrency: { key: "event.data.connectionId", limit: 1 },
    retries: 3,
  },
  async ({ event, step }) => {
    return step.run("sync", () =>
      runSyncStub({ connectionId: event.data.connectionId, trigger: event.data.trigger }),
    );
  },
);
