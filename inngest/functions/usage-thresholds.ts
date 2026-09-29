import { inngest } from "@/inngest/client";
import { runUsageThresholds } from "@/lib/billing/thresholds";

/** Hourly: rolls billing periods, notifies at 80% / 100% of the allowance, starts Free grace. */
export const usageThresholds = inngest.createFunction(
  { id: "usage-thresholds", triggers: [{ cron: "11 * * * *" }], retries: 2 },
  async ({ step }) => step.run("thresholds", () => runUsageThresholds()),
);
