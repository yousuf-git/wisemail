import { inngest } from "@/inngest/client";
import { applyDuePlanChanges } from "@/lib/services/plan-changes";

/**
 * Hourly: applies scheduled downgrades whose billing period ended (connections over the new
 * limit go read-only) and clears elapsed retention notices. With billing on, Stripe
 * subscription webhooks apply plan changes as they arrive (`lib/services/billing.ts`); this job
 * is the fallback for the cancel-at-period-end case and for the retention notices.
 */
export const applyPlanChange = inngest.createFunction(
  { id: "apply-plan-change", triggers: [{ cron: "23 * * * *" }], retries: 2 },
  async ({ step }) => step.run("apply-due", () => applyDuePlanChanges()),
);
