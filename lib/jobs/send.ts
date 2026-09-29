import "server-only";

import { z } from "zod";

import {
  connectionSyncRequested,
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
