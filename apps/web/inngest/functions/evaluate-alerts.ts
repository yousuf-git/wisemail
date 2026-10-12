import { alertsEvaluateRequested, inngest } from "@/inngest/client";
import { evaluateOrgAlerts } from "@/lib/services/alert-evaluation";
import { sendPendingNotificationEmails } from "@/lib/services/notifications";
import { Types } from "mongoose";

/**
 * Event-driven alert evaluation (TRD §2.8). `process-event` asks for one after each email or
 * domain event; a burst of events for one org collapses into a single run (debounce keyed by
 * org: 20 s of quiet, at most 2 minutes of waiting). The periodic `silence-check` covers what
 * events cannot: silence, and windows aging out.
 */
export const evaluateAlerts = inngest.createFunction(
  {
    id: "evaluate-alerts",
    triggers: [alertsEvaluateRequested],
    debounce: { key: "event.data.orgId", period: "20s", timeout: "2m" },
    retries: 3,
  },
  async ({ event, step }) => {
    const summary = await step.run("evaluate", () => evaluateOrgAlerts(event.data.orgId));
    if (summary.opened + summary.resolved > 0) {
      await step.run("send-emails", () =>
        sendPendingNotificationEmails({ orgId: new Types.ObjectId(event.data.orgId) }),
      );
    }
    return summary;
  },
);
