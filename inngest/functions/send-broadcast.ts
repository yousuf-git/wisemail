import { RetryAfterError } from "inngest";

import { broadcastSendRequested, inngest } from "@/inngest/client";
import { isResendError } from "@/lib/resend/errors";
import { FINAL_STATUSES, refreshBroadcastStatus } from "@/lib/services/broadcasts";

/** The slice of Inngest's `step` the loop uses, so tests can drive it without a server. */
export type BroadcastStepTools = {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
  sleep: (id: string, time: string) => Promise<void>;
  sleepUntil: (id: string, time: Date) => Promise<void>;
};

const isFinal = (status: string) =>
  status === "missing" || (FINAL_STATUSES as readonly string[]).includes(status);

/**
 * Follows a broadcast after it was sent or scheduled (TRD §2.5): sleeps until the scheduled time,
 * then asks Resend for its status every minute or so until it is sent, failed or canceled, and
 * mirrors each change (which also publishes the realtime event that refreshes open pages).
 */
export async function followBroadcast(
  step: BroadcastStepTools,
  data: { broadcastId: string },
  options: { checks?: number } = {},
) {
  const { broadcastId } = data;
  const checks = options.checks ?? 40;
  let current = await step.run("refresh-0", () => refreshBroadcastStatus(broadcastId));
  for (let i = 1; i <= checks && !isFinal(current.status); i++) {
    if (current.status === "scheduled" && current.scheduledAt) {
      const at = new Date(current.scheduledAt);
      if (at.getTime() > Date.now()) await step.sleepUntil(`until-scheduled-${i}`, at);
    } else {
      await step.sleep(`wait-${i}`, i < 6 ? "1m" : "5m");
    }
    current = await step.run(`refresh-${i}`, () => refreshBroadcastStatus(broadcastId));
  }
  return current;
}

/**
 * Throttled per connection like every job that calls Resend (TRD §2.3). A 429 sleeps for Resend's
 * `retry-after`; other failures retry with backoff.
 */
export const sendBroadcast = inngest.createFunction(
  {
    id: "send-broadcast",
    triggers: [broadcastSendRequested],
    throttle: { key: "event.data.connectionId", limit: 8, period: "1s" },
    retries: 4,
  },
  async ({ event, step }) => {
    try {
      return await followBroadcast(step as unknown as BroadcastStepTools, event.data);
    } catch (error) {
      if (isResendError(error) && error.code === "resend_rate_limited") {
        throw new RetryAfterError("Resend rate limit", `${error.details.retryAfterSeconds ?? 2}s`);
      }
      throw error;
    }
  },
);
