import { connectionDataDeleteRequested, inngest } from "@/inngest/client";
import { recordConnectionDataDeleted, runConnectionDataStep } from "@/lib/deletion/connection-data";

export type DataStepTools = {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
};

/** 500 emails per batch; one Inngest run allows 1,000 steps. */
export const MAX_BATCHES = 900;

export async function runConnectionDataLoop(
  step: DataStepTools,
  data: { connectionId: string; orgId: string; requestedBy: string },
  maxBatches = MAX_BATCHES,
) {
  let emails = 0;
  for (let batch = 0; batch < maxBatches; batch++) {
    const outcome = await step.run(`batch-${batch}`, () => runConnectionDataStep(data));
    emails += outcome.emails;
    if (outcome.done) {
      await step.run("audit", () =>
        recordConnectionDataDeleted({ ...data, emails, removed: outcome.removed ?? {} }),
      );
      return { status: "done" as const, emails };
    }
  }
  return { status: "continue" as const, emails };
}

/**
 * Deletes the mirrors and mail a removed connection synced (DBD §5): files in R2 first, then
 * documents, batch by batch. Scoped to one connection of one org.
 */
export const deleteConnectionData = inngest.createFunction(
  {
    id: "delete-connection-data",
    triggers: [connectionDataDeleteRequested],
    concurrency: { key: "event.data.connectionId", limit: 1 },
    retries: 4,
  },
  async ({ event, step }) => {
    const outcome = await runConnectionDataLoop(step as unknown as DataStepTools, event.data);
    if (outcome.status === "continue") {
      await step.sendEvent("continue", {
        name: connectionDataDeleteRequested.name,
        data: event.data,
      });
    }
    return outcome;
  },
);
