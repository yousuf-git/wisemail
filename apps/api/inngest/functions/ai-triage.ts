import { aiTriageRequested, inngest } from "@/inngest/client";
import { triageEmail } from "@/lib/services/ai-triage";

/**
 * AI triage of one received email (PRD §5.10, TRD §2.9): fast model, summary + category +
 * priority + sentiment. Idempotent per email (a summary already stored is never charged twice).
 * Plan, opt-out and credit problems end the run quietly; only provider trouble is retried.
 */
export const aiTriage = inngest.createFunction(
  {
    id: "ai-triage",
    triggers: [aiTriageRequested],
    // Bursts of inbound mail must not turn into a burst of provider calls for one org.
    concurrency: { key: "event.data.orgId", limit: 3 },
    retries: 3,
  },
  ({ event, step }) =>
    step.run("triage", () => triageEmail({ orgId: event.data.orgId, emailId: event.data.emailId })),
);
