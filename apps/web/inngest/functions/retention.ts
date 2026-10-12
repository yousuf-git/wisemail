import { Types } from "mongoose";

import { inngest } from "@/inngest/client";
import {
  applyOrgRetention,
  listOrgsForRetention,
  sweepExpiredOrphans,
} from "@/lib/deletion/retention";

/**
 * Daily (DBD §1 rule 8): deletes mail older than each org's plan retention, R2 objects first,
 * then the documents; and removes bodies and files whose email a TTL index already dropped
 * (`email_contents` and `attachments` have no TTL index because they own R2 objects). One step
 * per org, so one failing org is retried without redoing the others.
 */
export const retention = inngest.createFunction(
  { id: "retention", triggers: [{ cron: "41 3 * * *" }], retries: 3 },
  async ({ step }) => {
    const orgIds = await step.run("list-orgs", () => listOrgsForRetention());
    let emails = 0;
    let files = 0;
    for (const orgId of orgIds) {
      const result = await step.run(`retain-${orgId}`, () =>
        applyOrgRetention(new Types.ObjectId(orgId)),
      );
      emails += result.emails;
      files += result.files;
    }
    const orphans = await step.run("orphans", () => sweepExpiredOrphans());
    return {
      orgs: orgIds.length,
      emails,
      files: files + orphans.files,
      orphans: orphans.orphans,
    };
  },
);
