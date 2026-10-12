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

/** Check the DNS of one domain, every domain of a connection, or (no ids) of an organization. */
export const domainDnsCheckRequested = eventType("domain/dns-check.requested", {
  schema: z.object({
    orgId: z.string(),
    connectionId: z.string().optional(),
    domainId: z.string().optional(),
  }),
});

/** Work through an uploaded CSV import a batch at a time (PRD §5.9). */
export const contactImportRequested = eventType("audience/contacts.import.requested", {
  schema: z.object({ importId: z.string(), orgId: z.string(), connectionId: z.string() }),
});

/** Follow a sent or scheduled broadcast until Resend reports its final status (TRD §2.5). */
export const broadcastSendRequested = eventType("broadcast/send.requested", {
  schema: z.object({ broadcastId: z.string(), orgId: z.string(), connectionId: z.string() }),
});

/** Work through a large or "all matching" trash / delete / restore in batches (TRD §2.14). */
export const bulkDeleteRequested = eventType("mail/bulk-delete.requested", {
  schema: z.object({ opId: z.string(), orgId: z.string() }),
});

/** Delete what a removed connection synced (mirrors and mail), a batch at a time (DBD §5). */
export const connectionDataDeleteRequested = eventType("connection/data-delete.requested", {
  schema: z.object({ connectionId: z.string(), orgId: z.string(), requestedBy: z.string() }),
});

/** Triage one received email with the fast model (PRD §5.10). */
export const aiTriageRequested = eventType("ai/triage.requested", {
  schema: z.object({ emailId: z.string(), orgId: z.string() }),
});

export const eventTypes = {
  aiTriageRequested,
  bulkDeleteRequested,
  connectionDataDeleteRequested,
  contactImportRequested,
  broadcastSendRequested,
  domainDnsCheckRequested,
  alertsEvaluateRequested,
  resendEventReceived,
  connectionSyncRequested,
  inboundFetchRequested,
  sendEmailRequested,
} as const;
