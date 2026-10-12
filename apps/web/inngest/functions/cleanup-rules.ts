import { inngest } from "@/inngest/client";
import { listRunnableRuleIds, runCleanupRuleById } from "@/lib/deletion/rules";

/**
 * Hourly (TRD §2.14, P1): applies every enabled cleanup rule that has an age (archive, trash or
 * delete). One step per rule. `block_sender` rules are not run here: they act on arrival.
 */
export const cleanupRules = inngest.createFunction(
  { id: "cleanup-rules", triggers: [{ cron: "17 * * * *" }], retries: 2 },
  async ({ step }) => {
    const ruleIds = await step.run("list-rules", () => listRunnableRuleIds());
    let affected = 0;
    for (const id of ruleIds) {
      const result = await step.run(`rule-${id}`, () => runCleanupRuleById(id));
      affected += result.affected;
    }
    return { rules: ruleIds.length, affected };
  },
);
