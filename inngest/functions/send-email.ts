import { RetryAfterError } from "inngest";

import { inngest, sendEmailRequested } from "@/inngest/client";
import { isResendError } from "@/lib/resend/errors";
import { ServiceError } from "@/lib/services/errors";
import { deliverEmail, markSendFailed } from "@/lib/services/sending";

/**
 * Hands a queued or scheduled email to Resend (TRD §2.5). Throttled per connection (TRD §2.3).
 * Permanent failures (unverified domain, rejected payload) are recorded on the email by
 * `deliverEmail` and end the run without retries; a 429 sleeps for Resend's `retry-after`;
 * outages retry with backoff.
 */
export const sendEmail = inngest.createFunction(
  {
    id: "send-email",
    triggers: [sendEmailRequested],
    throttle: { key: "event.data.connectionId", limit: 8, period: "1s" },
    retries: 5,
    onFailure: async ({ event, step }) => {
      const original = event.data.event.data as { emailId: string };
      await step.run("mark-failed", () =>
        markSendFailed(original.emailId, "We couldn't reach Resend after several tries."),
      );
    },
  },
  async ({ event, step }) => {
    return step.run("deliver", async () => {
      try {
        return await deliverEmail(event.data.emailId);
      } catch (error) {
        if (error instanceof ServiceError) return { status: "failed" as const, code: error.code };
        if (isResendError(error) && error.code === "resend_rate_limited") {
          throw new RetryAfterError(
            "Resend rate limit",
            `${error.details.retryAfterSeconds ?? 2}s`,
          );
        }
        throw error;
      }
    });
  },
);
