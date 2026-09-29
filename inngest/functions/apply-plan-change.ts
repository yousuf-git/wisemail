import { inngest } from "@/inngest/client";
import { applyDuePlanChanges } from "@/lib/services/plan-changes";

/**
 * Hourly: applies scheduled downgrades whose billing period ended (connections over the new
 * limit go read-only) and clears elapsed retention notices.
 * TODO(phase 8): also triggered by Stripe subscription webhooks.
 */
export const applyPlanChange = inngest.createFunction(
  { id: "apply-plan-change", triggers: [{ cron: "23 * * * *" }], retries: 2 },
  async ({ step }) => step.run("apply-due", () => applyDuePlanChanges()),
);
