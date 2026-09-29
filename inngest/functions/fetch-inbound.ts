import { inboundFetchRequested, inngest } from "@/inngest/client";
import { fetchInboundEmail, markInboundFailed } from "@/lib/services/inbound";

/**
 * Body, raw MIME and attachments of a received email (TRD §2.4). Calls Resend, so it is throttled
 * per connection (TRD §2.3). Retried 5 times with backoff; when the retries are used up the
 * email shows "Content unavailable, retry".
 */
export const fetchInbound = inngest.createFunction(
  {
    id: "fetch-inbound",
    triggers: [inboundFetchRequested],
    throttle: { key: "event.data.connectionId", limit: 8, period: "1s" },
    retries: 5,
    onFailure: async ({ event, step }) => {
      const original = event.data.event.data as { emailId: string };
      await step.run("mark-failed", () => markInboundFailed(original.emailId));
    },
  },
  ({ event, step }) =>
    step.run("fetch", () =>
      fetchInboundEmail({ emailId: event.data.emailId, orgId: event.data.orgId }),
    ),
);
