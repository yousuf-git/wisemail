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

/** Fetch the full body and attachments of a received email (TRD §2.4). */
export const inboundFetchRequested = eventType("email/inbound.fetch.requested", {
  schema: z.object({ emailId: z.string(), orgId: z.string(), connectionId: z.string() }),
});

/** Hand a queued outbound email to Resend (TRD §2.5). */
export const sendEmailRequested = eventType("email/send.requested", {
  schema: z.object({ emailId: z.string(), orgId: z.string(), connectionId: z.string() }),
});

/** Something changed that alert rules may care about (an email event or a domain update). */
export const alertsEvaluateRequested = eventType("alerts/evaluate.requested", {
  schema: z.object({ orgId: z.string() }),
});

export const eventTypes = {
  alertsEvaluateRequested,
  resendEventReceived,
  connectionSyncRequested,
  inboundFetchRequested,
  sendEmailRequested,
} as const;
