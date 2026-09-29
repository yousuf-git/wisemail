import { inngest } from "@/inngest/client";
import { sendDailyDigests } from "@/lib/services/digest";

/**
 * Hourly (PRD §5.6): sends the daily digest to members of every org whose local time, in the
 * org's own time zone, has just reached the digest hour. Idempotent within a day.
 */
export const dailyDigest = inngest.createFunction(
  { id: "daily-digest", triggers: [{ cron: "0 * * * *" }], retries: 2 },
  async ({ step }) => step.run("send-digests", () => sendDailyDigests()),
);
