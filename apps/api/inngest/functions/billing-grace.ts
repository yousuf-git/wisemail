import { inngest } from "@/inngest/client";
import { expirePaymentGrace } from "@/lib/services/billing";

/**
 * Hourly: orgs still past due 14 days after the first failed payment move to Free under the
 * downgrade rules (PRICING §6 "Payment failure"). A no-op when nobody is past due.
 */
export const billingGrace = inngest.createFunction(
  { id: "billing-grace", triggers: [{ cron: "41 * * * *" }], retries: 2 },
  async ({ step }) => step.run("expire-grace", () => expirePaymentGrace()),
);
