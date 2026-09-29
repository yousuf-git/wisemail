import { inngest, resendEventReceived } from "@/inngest/client";
import { processWebhookEvent } from "@/lib/services/webhook-events";

/** Runs after ingest has stored an event. Idempotent; see `processWebhookEvent` for the TODOs. */
export const processEvent = inngest.createFunction(
  { id: "process-event", triggers: [resendEventReceived], retries: 4 },
  async ({ event, step }) => {
    return step.run("process", () => processWebhookEvent(event.data.eventId));
  },
);
