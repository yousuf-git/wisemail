import { inngest } from "@/inngest/client";
import { reportOverageUsage } from "@/lib/services/billing-usage";

/**
 * Daily (and so also at period end): reports tracked emails above the allowance to Stripe's
 * Billing Meters, one idempotent meter event per 10k-email unit (`lib/services/billing-usage.ts`).
 * A no-op while `BILLING_ENABLED=false`. Errors are retried; units already sent are never sent
 * twice because their meter-event identifiers repeat.
 */
export const reportUsage = inngest.createFunction(
  { id: "report-usage", triggers: [{ cron: "17 2 * * *" }], retries: 3 },
  async ({ step }) => {
    const result = await step.run("report", () => reportOverageUsage());
    if (result.errors > 0) throw new Error(`report-usage: ${result.errors} org(s) failed`);
    return result;
  },
);
