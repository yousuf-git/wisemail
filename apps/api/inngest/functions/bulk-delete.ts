import { bulkDeleteRequested, inngest } from "@/inngest/client";
import { failBulkOperation, runBulkStep } from "@/lib/deletion/bulk";

export type BulkStepTools = {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
};

/** Inngest allows 1,000 steps per run; a batch is 500 items, so one run covers 450,000 items. */
export const MAX_BATCHES = 900;

export async function runBulkLoop(
  step: BulkStepTools,
  data: { opId: string },
  maxBatches = MAX_BATCHES,
) {
  for (let batch = 0; batch < maxBatches; batch++) {
    const outcome = await step.run(`batch-${batch}`, () => runBulkStep(data.opId));
    if (outcome.done) return { status: "done" as const, batches: batch + 1, ...outcome };
  }
  return { status: "continue" as const, batches: maxBatches };
}

/**
 * Trash, permanent delete or restore of a large or "all matching" selection (TRD §2.14): batches
 * of 500 with one transaction each, progress on the `bulk_operations` document (and over realtime),
 * one audit entry at the end. One run per org at a time. A retried step is idempotent.
 */
export const bulkDelete = inngest.createFunction(
  {
    id: "bulk-delete",
    triggers: [bulkDeleteRequested],
    concurrency: { key: "event.data.orgId", limit: 1 },
    retries: 4,
    onFailure: async ({ event, step }) => {
      const original = event.data.event.data as { opId: string };
      await step.run("mark-failed", () =>
        failBulkOperation(original.opId, "The bulk operation could not be finished."),
      );
    },
  },
  async ({ event, step }) => {
    const outcome = await runBulkLoop(step as unknown as BulkStepTools, event.data);
    if (outcome.status === "continue") {
      await step.sendEvent("continue", { name: bulkDeleteRequested.name, data: event.data });
    }
    return outcome;
  },
);
