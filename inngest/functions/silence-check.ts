import { inngest } from "@/inngest/client";
import { evaluateOrgAlerts, orgsWithEnabledRules } from "@/lib/services/alert-evaluation";
import { sendPendingNotificationEmails } from "@/lib/services/notifications";

/**
 * Every 5 minutes (TRD §2.8): evaluates every org that has enabled alert rules, then flushes
 * queued notification emails (including ones deferred by quiet hours). This is what notices a
 * connection going silent, what resolves rate incidents once their window has moved on, and the
 * safety net for events whose evaluation request was lost. Each org is its own step, so one
 * failing org is retried without redoing the others.
 */
export const silenceCheck = inngest.createFunction(
  { id: "silence-check", triggers: [{ cron: "*/5 * * * *" }], retries: 2 },
  async ({ step }) => {
    const orgIds = await step.run("list-orgs", () => orgsWithEnabledRules());
    let opened = 0;
    let resolved = 0;
    for (const orgId of orgIds) {
      const summary = await step.run(`evaluate-${orgId}`, () => evaluateOrgAlerts(orgId));
      opened += summary.opened;
      resolved += summary.resolved;
    }
    const emails = await step.run("send-emails", () => sendPendingNotificationEmails());
    return { orgs: orgIds.length, opened, resolved, emails };
  },
);
