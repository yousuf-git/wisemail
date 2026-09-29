import "server-only";

import { z } from "zod";

import {
  alertsEvaluateRequested,
  broadcastSendRequested,
  contactImportRequested,
  connectionSyncRequested,
  domainDnsCheckRequested,
  inboundFetchRequested,
  resendEventReceived,
  sendEmailRequested,
} from "@/inngest/events";
import { env } from "@/lib/env";

/**
 * All job enqueueing goes through here so tests never need an Inngest server.
 * - test (`NODE_ENV=test`): events are recorded in memory (`sentJobs`), nothing leaves the process;
 * - development with `INNGEST_DEV`: sent to the local dev server, and a failure (server not
 *   running) is logged, not thrown, so ingest and onboarding keep working;
 * - production: sent to Inngest; failures throw so the caller can react (ingest answers 500 and
 *   Resend retries).
 */
export type JobEvent =
  | {
      name: typeof resendEventReceived.name;
      data: z.infer<NonNullable<typeof resendEventReceived.schema>>;
    }
  | {
      name: typeof connectionSyncRequested.name;
      data: z.infer<NonNullable<typeof connectionSyncRequested.schema>>;
    }
  | {
      name: typeof inboundFetchRequested.name;
      data: z.infer<NonNullable<typeof inboundFetchRequested.schema>>;
    }
  | {
      name: typeof sendEmailRequested.name;
      data: z.infer<NonNullable<typeof sendEmailRequested.schema>>;
    }
  | {
      name: typeof alertsEvaluateRequested.name;
      data: z.infer<NonNullable<typeof alertsEvaluateRequested.schema>>;
    }
  | {
      name: typeof contactImportRequested.name;
      data: z.infer<NonNullable<typeof contactImportRequested.schema>>;
    }
  | {
      name: typeof broadcastSendRequested.name;
      data: z.infer<NonNullable<typeof broadcastSendRequested.schema>>;
    }
  | {
      name: typeof domainDnsCheckRequested.name;
      data: z.infer<NonNullable<typeof domainDnsCheckRequested.schema>>;
    };

export const sentJobs: JobEvent[] = [];
export const resetSentJobs = () => void (sentJobs.length = 0);

/** Resolves `true` when the job was handed over, `false` when a dev server could not be reached. */
async function send(event: JobEvent): Promise<boolean> {
  if (env.NODE_ENV === "test") {
    sentJobs.push(event);
    return true;
  }
  const { inngest } = await import("@/inngest/client");
  try {
    await inngest.send({ name: event.name, data: event.data });
    return true;
  } catch (error) {
    if (env.NODE_ENV !== "production" && env.INNGEST_DEV) {
      console.warn(
        `[jobs] Could not reach the Inngest dev server; dropped "${event.name}". ` +
          "Run `npx inngest-cli@latest dev` to process jobs locally.",
      );
      return false;
    }
    throw error;
  }
}

export const enqueueEventReceived = (eventId: string) =>
  send({ name: "resend/event.received", data: { eventId } });

export const enqueueConnectionSync = (data: {
  connectionId: string;
  orgId: string;
  trigger: "initial" | "scheduled" | "manual";
}) => send({ name: "connection/sync.requested", data });

export const enqueueFetchInbound = (data: {
  emailId: string;
  orgId: string;
  connectionId: string;
}) => send({ name: "email/inbound.fetch.requested", data });

export const enqueueSendEmail = (data: { emailId: string; orgId: string; connectionId: string }) =>
  send({ name: "email/send.requested", data });

/** Ask for an alert evaluation of one org; the job is debounced per org. */
export const enqueueAlertEvaluation = (data: { orgId: string }) =>
  send({ name: "alerts/evaluate.requested", data });

/** Ask for a DNS check of one domain or connection (or every domain of the org). */
export const enqueueDnsCheck = (data: {
  orgId: string;
  connectionId?: string;
  domainId?: string;
}) => send({ name: "domain/dns-check.requested", data });

/** Hand an uploaded CSV import to the throttled `import-contacts` job. */
export const enqueueContactImport = (data: {
  importId: string;
  orgId: string;
  connectionId: string;
}) => send({ name: "audience/contacts.import.requested", data });

/** Follow a sent or scheduled broadcast until it has a final status. */
export const enqueueBroadcastSend = (data: {
  broadcastId: string;
  orgId: string;
  connectionId: string;
}) => send({ name: "broadcast/send.requested", data });
