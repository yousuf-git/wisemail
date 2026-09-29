import { eventType } from "inngest";
import { z } from "zod";

/** A stored `webhook_events` document is ready to process. */
export const resendEventReceived = eventType("resend/event.received", {
  schema: z.object({ eventId: z.string() }),
});

/** Run (or resume) a sync for one connection. */
export const connectionSyncRequested = eventType("connection/sync.requested", {
  schema: z.object({
    connectionId: z.string(),
    orgId: z.string(),
    trigger: z.enum(["initial", "scheduled", "manual"]),
  }),
});

export const eventTypes = { resendEventReceived, connectionSyncRequested } as const;
