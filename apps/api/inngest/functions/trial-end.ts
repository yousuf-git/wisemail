import { inngest } from "@/inngest/client";
import { endExpiredTrials, notifyTrialEnding } from "@/lib/services/plan-changes";

/** Daily: warns Owners before the Pro trial ends and moves expired trials to Free. */
export const trialEnd = inngest.createFunction(
  { id: "trial-end", triggers: [{ cron: "37 3 * * *" }], retries: 2 },
  async ({ step }) => {
    const warned = await step.run("notify", () => notifyTrialEnding());
    const ended = await step.run("end", () => endExpiredTrials());
    return { ...warned, ...ended };
  },
);
