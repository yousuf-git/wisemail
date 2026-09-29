import { inngest, resendEventReceived } from "@/inngest/client";
import { dispatchFetchInbound } from "@/lib/services/inbound";
import { processWebhookEvent } from "@/lib/services/events-processing";

/**
 * Runs after ingest has stored an event (TRD §2.1 step 5). The database work is one idempotent
 * step; for `email.received` a second step enqueues `fetch-inbound`, so a failure there is
 * retried on its own without re-processing the event.
 */
export const processEvent = inngest.createFunction(
  { id: "process-event", triggers: [resendEventReceived], retries: 4 },
  async ({ event, step }) => {
    const outcome = await step.run("process", () => processWebhookEvent(event.data.eventId));
    const request = outcome.fetchInbound;
    if (request) await step.run("enqueue-fetch-inbound", () => dispatchFetchInbound(request));
    return { found: outcome.found, type: outcome.type, ignoredReason: outcome.ignoredReason };
  },
);
