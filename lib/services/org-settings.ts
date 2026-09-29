import type { ClientSession, Types } from "mongoose";

import { OrgSettingsModel, calendarMonth } from "@/lib/db/models/org-settings";
import { writeAuditLog } from "./audit";

/**
 * Creates the `org_settings` document for a new organization (free plan, UTC, current calendar
 * month, AI on but plan-gated) and records `organization.created` in the audit log. Idempotent: an
 * existing settings document is left untouched and no second audit entry is written.
 * Call inside `withTransaction` so both writes land together.
 */
export async function provisionOrganization(
  input: { orgId: Types.ObjectId; actorId: Types.ObjectId; name: string; slug: string },
  options: { session?: ClientSession; now?: Date } = {},
): Promise<{ created: boolean }> {
  const { session, now = new Date() } = options;

  const result = await OrgSettingsModel.updateOne(
    { orgId: input.orgId },
    {
      $setOnInsert: {
        orgId: input.orgId,
        plan: "free",
        planState: "free",
        trial: null,
        billingPeriod: calendarMonth(now),
        billingInterval: null,
        extraConnections: 0,
        aiCredits: { periodAllowance: 0, periodUsed: 0, reserved: 0, packBalance: 0 },
        grace: {},
        pendingChange: null,
        timezone: "UTC",
        // Opt-out (PRD §5.10): on by default, but inert until the plan includes AI.
        ai: {
          enabled: true,
          features: { triage: true, drafts: true, compose: true, anomalies: true },
        },
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, session, timestamps: false },
  );

  const created = result.upsertedCount > 0;
  if (created) {
    await writeAuditLog(
      {
        orgId: input.orgId,
        actor: { type: "user", id: input.actorId },
        action: "organization.created",
        target: { type: "organization", id: input.orgId },
        changes: { after: { name: input.name, slug: input.slug, plan: "free" } },
      },
      { session },
    );
  }
  return { created };
}

export async function getOrgSettings(orgId: Types.ObjectId) {
  return OrgSettingsModel.findOne({ orgId }).lean();
}
