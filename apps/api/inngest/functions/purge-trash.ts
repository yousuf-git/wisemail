import { inngest } from "@/inngest/client";
import { purgeExpiredTrash } from "@/lib/deletion/retention";

/**
 * Daily (TRD §2.14): permanently deletes what has been in Trash for 30 days (`purgeAt` passed):
 * R2 objects first, then documents, with tombstones so mail never comes back. Bounded per run;
 * whatever is left is picked up the next day.
 */
export const purgeTrash = inngest.createFunction(
  { id: "purge-trash", triggers: [{ cron: "23 3 * * *" }], retries: 3 },
  async ({ step }) => step.run("purge", () => purgeExpiredTrash()),
);
