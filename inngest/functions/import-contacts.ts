import { contactImportRequested, inngest } from "@/inngest/client";
import { runImportStep, type ImportStep } from "@/lib/services/contacts";

export type ImportStepTools = {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
  sleep: (id: string, time: string) => Promise<void>;
};

/** Inngest allows 1,000 steps per run; a batch is 25 rows, so this covers the 20,000 row cap. */
export const MAX_BATCHES = 900;

export async function runImportLoop(
  step: ImportStepTools,
  data: { importId: string },
  maxBatches = MAX_BATCHES,
) {
  for (let batch = 0; batch < maxBatches; batch++) {
    const outcome: ImportStep = await step.run(`batch-${batch}`, () =>
      runImportStep(data.importId),
    );
    if (outcome.done) return { status: "done" as const, batches: batch + 1 };
    if (outcome.retryAfterSeconds)
      await step.sleep(`backoff-${batch}`, `${outcome.retryAfterSeconds}s`);
  }
  return { status: "continue" as const, batches: maxBatches };
}

/**
 * Feeds an uploaded CSV to Resend a batch at a time (PRD §5.9). Throttled per connection and run
 * one at a time per connection, so a large import never starves the account's other calls
 * (TRD §2.3). Progress lives on the `contact_imports` document, so a retry never repeats rows.
 */
export const importContacts = inngest.createFunction(
  {
    id: "import-contacts",
    triggers: [contactImportRequested],
    throttle: { key: "event.data.connectionId", limit: 8, period: "1s" },
    concurrency: { key: "event.data.connectionId", limit: 1 },
    retries: 3,
  },
  async ({ event, step }) => {
    const outcome = await runImportLoop(step as unknown as ImportStepTools, event.data);
    if (outcome.status === "continue") {
      await step.sendEvent("continue", { name: contactImportRequested.name, data: event.data });
    }
    return outcome;
  },
);
